import { ApiPropertyOptional, ApiProperty } from "@nestjs/swagger";
import { ROLES, type Role } from "@nv/domain";
import { IsIn, IsInt, IsOptional, Max, Min } from "class-validator";

/** Roles a shared link may grant (never Owner). */
export const INVITE_LINK_ROLES = ROLES.filter((r) => r !== "Owner");

export class CreateInviteLinkDto {
  @ApiProperty({ enum: INVITE_LINK_ROLES, example: "Visor" })
  @IsIn(INVITE_LINK_ROLES)
  role!: Role;

  @ApiPropertyOptional({ description: "Días que dura el enlace (1–30). Por defecto 7." })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  days?: number;

  @ApiPropertyOptional({ description: "Cuántas personas pueden usarlo (1–50). Sin valor: sin límite." })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  maxUses?: number;
}
