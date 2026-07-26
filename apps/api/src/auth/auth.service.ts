import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { getWorkspaceBySlug, type Role } from "@nv/domain";

import type { AppConfig } from "../config/configuration";
import { MailService } from "../common/mail.service";
import { AuthStore } from "./auth.store";
import { hashPassword, verifyPassword } from "./password.util";
import { generateRefreshToken, hashToken } from "./token.util";
import type {
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
}

/** Sanitized session view returned in the response body. */
export interface SessionView {
  user: PublicUser;
  memberships: MembershipView[];
}

@Injectable()
export class AuthService {
  constructor(
    private readonly store: AuthStore,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<AppConfig, true>,
    private readonly mail: MailService,
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

    // Optional workspace bootstrap: first member of a workspace becomes Owner.
    if (dto.workspaceSlug) {
      if (!getWorkspaceBySlug(dto.workspaceSlug)) {
        throw new NotFoundException(`Workspace "${dto.workspaceSlug}" no encontrado`);
      }
      const hasMembers = await this.store.workspaceHasMembers(dto.workspaceSlug);
      if (!hasMembers) {
        await this.store.upsertMembership(user.id, dto.workspaceSlug, "Owner");
      }
    }

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
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.store.findUserByEmail(dto.email);
    if (!user || !(await verifyPassword(dto.password, user.passwordHash))) {
      throw new UnauthorizedException("Credenciales inválidas.");
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
    };
  }

  /** Adds an existing user to a workspace with a role (Owner/Admin action). */
  async addMember(workspaceSlug: string, email: string, role: Role): Promise<MembershipView> {
    const user = await this.store.findUserByEmail(email);
    if (!user) {
      throw new NotFoundException("No existe un usuario con ese email. Debe registrarse primero.");
    }
    await this.store.upsertMembership(user.id, workspaceSlug, role);

    // Best-effort notification — never blocks the membership change.
    const workspace = getWorkspaceBySlug(workspaceSlug);
    void this.mail.send({
      to: user.email,
      subject: `Te añadieron a ${workspace?.name ?? workspaceSlug} en NV Core`,
      html:
        `<p>Hola ${user.name ?? ""},</p>` +
        `<p>Ahora eres <strong>${role}</strong> en el workspace ` +
        `<strong>${workspace?.name ?? workspaceSlug}</strong> de NV Core.</p>` +
        `<p>Inicia sesión para empezar a colaborar.</p>`,
    });

    return { workspaceSlug, role };
  }

  /** Removes a member from a workspace. Protects the last Owner. */
  async removeMember(workspaceSlug: string, userId: string): Promise<void> {
    const membership = await this.store.getMembership(userId, workspaceSlug);
    if (!membership) throw new NotFoundException("El usuario no es miembro de este workspace.");
    if (membership.role === "Owner") {
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
    };
  }
}
