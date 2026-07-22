import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { getWorkspaceBySlug, type Role } from "@nv/domain";

import { AuthStore } from "./auth.store";
import { hashPassword, verifyPassword } from "./password.util";
import type {
  JwtPayload,
  MembershipView,
  PublicUser,
  UserRecord,
} from "./auth.types";
import type { RegisterDto } from "./dto/register.dto";
import type { LoginDto } from "./dto/login.dto";

export interface AuthResult {
  accessToken: string;
  user: PublicUser;
  memberships: MembershipView[];
}

@Injectable()
export class AuthService {
  constructor(
    private readonly store: AuthStore,
    private readonly jwt: JwtService,
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

    return this.buildResult(user);
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.store.findUserByEmail(dto.email);
    if (!user || !(await verifyPassword(dto.password, user.passwordHash))) {
      throw new UnauthorizedException("Credenciales inválidas.");
    }
    return this.buildResult(user);
  }

  async me(userId: string): Promise<AuthResult> {
    const user = await this.store.findUserById(userId);
    if (!user) throw new NotFoundException("Usuario no encontrado.");
    return this.buildResult(user);
  }

  /** Adds an existing user to a workspace with a role (Owner/Admin action). */
  async addMember(workspaceSlug: string, email: string, role: Role): Promise<MembershipView> {
    const user = await this.store.findUserByEmail(email);
    if (!user) {
      throw new NotFoundException("No existe un usuario con ese email. Debe registrarse primero.");
    }
    await this.store.upsertMembership(user.id, workspaceSlug, role);
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

  private async buildResult(user: UserRecord): Promise<AuthResult> {
    const memberships = await this.store.membershipsOf(user.id);
    const payload: JwtPayload = { sub: user.id, email: user.email, name: user.name };
    // Secret + expiry come from JwtModule config (see AuthModule).
    const accessToken = await this.jwt.signAsync(payload);

    return {
      accessToken,
      user: { id: user.id, email: user.email, name: user.name },
      memberships: memberships.map((m) => ({ workspaceSlug: m.workspaceSlug, role: m.role })),
    };
  }
}
