import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { getWorkspaceBySlug, type Role } from "@nv/domain";

import type { AppConfig } from "../config/configuration";
import { MailService } from "../common/mail.service";
import { PlanService } from "../common/plan/plan.service";
import { AuthStore } from "./auth.store";
import { DUMMY_PASSWORD_HASH, hashPassword, verifyPassword } from "./password.util";
import { generateRefreshToken, hashToken } from "./token.util";
import type {
  InvitationRecord,
  JwtPayload,
  MembershipView,
  PublicUser,
  UserRecord,
} from "./auth.types";
import type { RegisterDto } from "./dto/register.dto";
import type { LoginDto } from "./dto/login.dto";

/** Full result (internal): includes the raw refresh token for the cookie. */
export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: PublicUser;
  memberships: MembershipView[];
  superAdmin: boolean;
}

/** Sanitized session view returned in the response body. */
export interface SessionView {
  user: PublicUser;
  memberships: MembershipView[];
  /** True when the user is a platform super-admin (NV_SUPER_ADMINS / NV_ADMIN_EMAIL). */
  superAdmin: boolean;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly store: AuthStore,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<AppConfig, true>,
    private readonly mail: MailService,
    private readonly plans: PlanService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResult> {
    const existing = await this.store.findUserByEmail(dto.email);
    if (existing) throw new ConflictException("El email ya está registrado.");

    const passwordHash = await hashPassword(dto.password);
    const user = await this.store.createUser({
      email: dto.email,
      name: dto.name,
      passwordHash,
    });

    // Optional workspace bootstrap: first member of an unclaimed workspace
    // becomes Owner — but ONLY when open self-serve claiming is explicitly
    // enabled. Off by default so an attacker can't land-grab Owner of an
    // unclaimed built-in workspace (provisioning is via NV_ADMIN_* or invite).
    if (dto.workspaceSlug && this.config.get("auth", { infer: true }).allowOpenWorkspaceClaim) {
      if (!getWorkspaceBySlug(dto.workspaceSlug)) {
        throw new NotFoundException(`Workspace "${dto.workspaceSlug}" no encontrado`);
      }
      const hasMembers = await this.store.workspaceHasMembers(dto.workspaceSlug);
      if (!hasMembers) {
        await this.store.upsertMembership(user.id, dto.workspaceSlug, "Owner");
      }
    }

    // Grant any workspace invitations addressed to this email so the invitee
    // lands in the workspace immediately after registering.
    await this.applyPendingInvitations(user.id, user.email);

    // Best-effort verification email (no-op if Resend isn't configured).
    await this.sendVerificationEmail(user.id, user.email, user.name);
    return this.issueTokens(user);
  }

  // ── Email verification ──────────────────────────────────────────────────
  private async sendVerificationEmail(userId: string, email: string, name: string): Promise<void> {
    const raw = generateRefreshToken();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await this.store.createAuthToken(userId, "verify", hashToken(raw), expiresAt);
    const url = `${this.config.get("appUrl", { infer: true })}/verify-email?token=${raw}`;
    await this.mail.send({
      to: email,
      subject: "Verifica tu email · NV Core",
      html:
        `<p>Hola ${name},</p><p>Confirma tu email para activar tu cuenta:</p>` +
        `<p><a href="${url}">Verificar email</a></p>` +
        `<p>El enlace caduca en 24 horas.</p>`,
    });
  }

  async resendVerification(userId: string, email: string, name: string): Promise<void> {
    await this.sendVerificationEmail(userId, email, name);
  }

  async verifyEmail(token: string): Promise<void> {
    const consumed = await this.store.consumeAuthToken(hashToken(token), "verify");
    if (!consumed) throw new BadRequestException("Token de verificación inválido o expirado.");
    await this.store.setEmailVerified(consumed.userId);
  }

  // ── Password reset ──────────────────────────────────────────────────────
  /** Always resolves (does not reveal whether the email exists). */
  async requestPasswordReset(email: string): Promise<void> {
    const user = await this.store.findUserByEmail(email);
    if (!user) return;
    const raw = generateRefreshToken();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await this.store.createAuthToken(user.id, "reset", hashToken(raw), expiresAt);
    const url = `${this.config.get("appUrl", { infer: true })}/reset-password?token=${raw}`;
    await this.mail.send({
      to: user.email,
      subject: "Restablece tu contraseña · NV Core",
      html:
        `<p>Hola ${user.name},</p><p>Solicitaste restablecer tu contraseña:</p>` +
        `<p><a href="${url}">Crear nueva contraseña</a></p>` +
        `<p>Si no fuiste tú, ignora este correo. El enlace caduca en 1 hora.</p>`,
    });
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const consumed = await this.store.consumeAuthToken(hashToken(token), "reset");
    if (!consumed) throw new BadRequestException("Token de restablecimiento inválido o expirado.");
    await this.store.updatePassword(consumed.userId, await hashPassword(newPassword));
    // Invalidate existing sessions after a password change.
    await this.store.revokeAllRefreshTokens(consumed.userId);
    // A password reset also clears any brute-force lock (the user proved control
    // of their inbox), so a locked-out user isn't stuck after resetting.
    await this.store.clearFailedLogins(consumed.userId);
  }

  /** Lock an account for this long after too many consecutive failed logins. */
  private static readonly MAX_FAILED_LOGINS = 5;
  private static readonly LOCK_DURATION_MS = 15 * 60_000; // 15 minutes

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.store.findUserByEmail(dto.email);

    // Refuse while locked — even with the correct password — until the window
    // passes. Applies only to real accounts (we can't lock a non-existent one).
    if (user?.lockedUntil && new Date(user.lockedUntil).getTime() > Date.now()) {
      throw new HttpException(
        "Cuenta bloqueada temporalmente por demasiados intentos. Inténtalo más tarde.",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Run scrypt in both branches (real hash or a dummy) so response time
    // doesn't reveal whether the email exists.
    const passwordValid = await verifyPassword(
      dto.password,
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );
    if (!user || !passwordValid) {
      // Count the failure and lock the account once the threshold is reached.
      if (user) {
        const attempts = await this.store.incrementFailedLogins(user.id);
        if (attempts >= AuthService.MAX_FAILED_LOGINS) {
          await this.store.lockUser(user.id, new Date(Date.now() + AuthService.LOCK_DURATION_MS));
        }
      }
      throw new UnauthorizedException("Credenciales inválidas.");
    }

    // Success: clear any accumulated failures / lock.
    if (user.failedLoginAttempts > 0 || user.lockedUntil) {
      await this.store.clearFailedLogins(user.id);
    }
    return this.issueTokens(user);
  }

  /** Rotate a refresh token: revoke the old, issue a fresh pair. */
  async refresh(rawRefreshToken: string | undefined): Promise<AuthResult> {
    if (!rawRefreshToken) throw new UnauthorizedException("Falta el refresh token.");
    const hash = hashToken(rawRefreshToken);
    const record = await this.store.findValidRefreshToken(hash);
    if (!record) throw new UnauthorizedException("Refresh token inválido o expirado.");
    await this.store.revokeRefreshToken(hash);
    const user = await this.store.findUserById(record.userId);
    if (!user) throw new UnauthorizedException("Usuario no encontrado.");
    return this.issueTokens(user);
  }

  async logout(rawRefreshToken: string | undefined): Promise<void> {
    if (rawRefreshToken) await this.store.revokeRefreshToken(hashToken(rawRefreshToken));
  }

  async me(userId: string): Promise<SessionView> {
    const user = await this.store.findUserById(userId);
    if (!user) throw new NotFoundException("Usuario no encontrado.");
    const memberships = await this.store.membershipsOf(user.id);
    return {
      user: { id: user.id, email: user.email, name: user.name },
      memberships: memberships.map((m) => ({ workspaceSlug: m.workspaceSlug, role: m.role })),
      superAdmin: this.isSuperAdmin(user.email),
    };
  }

  /** Whether an email is a platform super-admin. */
  isSuperAdmin(email: string): boolean {
    return this.config.get("superAdmins", { infer: true }).includes(email.toLowerCase());
  }

  /**
   * Adds/updates a member of a workspace (Owner/Admin action, enforced by
   * RolesGuard). Privilege-escalation guard: only an Owner may grant the Owner
   * role or modify an existing Owner — otherwise an Admin could upsert itself to
   * Owner (or demote the real Owner) via this endpoint.
   */
  async addMember(
    workspaceSlug: string,
    actingUserId: string,
    email: string,
    role: Role,
  ): Promise<{ status: "added" | "invited" }> {
    const actorMembership = await this.store.getMembership(actingUserId, workspaceSlug);
    const actorIsOwner = actorMembership?.role === "Owner";
    const workspace = getWorkspaceBySlug(workspaceSlug);

    const user = await this.store.findUserByEmail(email);

    // Guard the Owner role up-front (applies to both add and invite): only an
    // Owner can grant the Owner role. Blocks Admin self-escalation.
    if (!actorIsOwner && role === "Owner") {
      throw new ForbiddenException("Solo un Owner puede asignar el rol Owner.");
    }

    // ── Email without an account yet → create a pending invitation ──────────
    if (!user) {
      // A new seat is being committed (best-effort — accepted invites also join).
      await this.plans.assertWithinLimit(workspaceSlug, "teamMembers", 1);
      const token = generateRefreshToken();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const actor = await this.store.findUserById(actingUserId);
      await this.store.upsertInvitation({
        workspaceSlug,
        email,
        role,
        token,
        invitedByName: actor?.name ?? null,
        expiresAt,
      });
      const url = `${this.config.get("appUrl", { infer: true })}/register?invite=${token}&email=${encodeURIComponent(email)}`;
      void this.mail.send({
        to: email,
        subject: `Te invitaron a ${workspace?.name ?? workspaceSlug} en NV Core`,
        html:
          `<p>¡Hola!</p>` +
          `<p>Te invitaron a colaborar como <strong>${role}</strong> en el workspace ` +
          `<strong>${workspace?.name ?? workspaceSlug}</strong> de NV Core.</p>` +
          `<p><a href="${url}">Crea tu cuenta para unirte</a>. Al registrarte con este ` +
          `correo (${email}) entrarás automáticamente al workspace.</p>` +
          `<p>La invitación caduca en 7 días.</p>`,
      });
      return { status: "invited" };
    }

    // ── Existing user → add or change role directly ─────────────────────────
    const existing = await this.store.getMembership(user.id, workspaceSlug);
    // Only an Owner can modify an existing Owner's role (blocks Owner demotion).
    if (!actorIsOwner && existing?.role === "Owner") {
      throw new ForbiddenException("Solo un Owner puede modificar el rol Owner.");
    }
    // Only genuinely new members count against the plan seat limit; changing an
    // existing member's role must never be blocked (net member count is unchanged).
    if (!existing) {
      await this.plans.assertWithinLimit(workspaceSlug, "teamMembers", 1);
    }
    await this.store.upsertMembership(user.id, workspaceSlug, role);

    // Best-effort notification — never blocks the membership change.
    void this.mail.send({
      to: user.email,
      subject: `Te añadieron a ${workspace?.name ?? workspaceSlug} en NV Core`,
      html:
        `<p>Hola ${user.name ?? ""},</p>` +
        `<p>Ahora eres <strong>${role}</strong> en el workspace ` +
        `<strong>${workspace?.name ?? workspaceSlug}</strong> de NV Core.</p>` +
        `<p>Inicia sesión para empezar a colaborar.</p>`,
    });

    return { status: "added" };
  }

  /** Pending invitations for a workspace (Owner/Admin view). */
  async listInvitations(workspaceSlug: string): Promise<InvitationRecord[]> {
    return this.store.listPendingInvitations(workspaceSlug);
  }

  /** Revoke a pending invitation. */
  async revokeInvitation(workspaceSlug: string, invitationId: string): Promise<void> {
    const removed = await this.store.deleteInvitation(workspaceSlug, invitationId);
    if (!removed) throw new NotFoundException("Invitación no encontrada.");
  }

  /** Grant any pending invitations addressed to this email (called on register). */
  private async applyPendingInvitations(userId: string, email: string): Promise<void> {
    const pending = await this.store.findPendingInvitationsByEmail(email);
    for (const inv of pending) {
      await this.store.upsertMembership(userId, inv.workspaceSlug, inv.role);
      await this.store.markInvitationAccepted(inv.id);
    }
  }

  /** Removes a member from a workspace. Protects the last Owner, and only an
   * Owner may remove another Owner (Admins can't oust Owners). */
  async removeMember(workspaceSlug: string, actingUserId: string, userId: string): Promise<void> {
    const membership = await this.store.getMembership(userId, workspaceSlug);
    if (!membership) throw new NotFoundException("El usuario no es miembro de este workspace.");
    if (membership.role === "Owner") {
      const actorMembership = await this.store.getMembership(actingUserId, workspaceSlug);
      if (actorMembership?.role !== "Owner") {
        throw new ForbiddenException("Solo un Owner puede quitar a otro Owner.");
      }
      const owners = (await this.store.membershipsOfWorkspace(workspaceSlug)).filter(
        (m) => m.role === "Owner",
      );
      if (owners.length <= 1) {
        throw new BadRequestException("No puedes quitar al último Owner del workspace.");
      }
    }
    await this.store.removeMembership(userId, workspaceSlug);
  }

  private async issueTokens(user: UserRecord): Promise<AuthResult> {
    const memberships = await this.store.membershipsOf(user.id);
    const payload: JwtPayload = { sub: user.id, email: user.email, name: user.name };
    // Access token: secret + short expiry come from JwtModule config (AuthModule).
    const accessToken = await this.jwt.signAsync(payload);

    // Refresh token: opaque, persisted as a hash, rotated on each refresh.
    const refreshToken = generateRefreshToken();
    const ttlDays = this.config.get("auth", { infer: true }).refreshTtlDays;
    const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);
    await this.store.createRefreshToken(user.id, hashToken(refreshToken), expiresAt);

    return {
      accessToken,
      refreshToken,
      user: { id: user.id, email: user.email, name: user.name },
      memberships: memberships.map((m) => ({ workspaceSlug: m.workspaceSlug, role: m.role })),
      superAdmin: this.isSuperAdmin(user.email),
    };
  }
}
