import { ApiProperty } from "@nestjs/swagger";
import { ROLES, type Role } from "@nv/domain";
import { IsEmail, IsIn } from "class-validator";

export class AddMemberDto {
  @ApiProperty({ example: "editor@empresa.com" })
  @IsEmail()
  email!: string;

  @ApiProperty({ enum: ROLES, example: "Editor" })
  @IsIn(ROLES)
  role!: Role;
}
