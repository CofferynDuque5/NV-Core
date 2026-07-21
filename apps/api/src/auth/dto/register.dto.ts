import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEmail, IsOptional, IsString, MinLength } from "class-validator";

export class RegisterDto {
  @ApiProperty({ example: "founder@empresa.com" })
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({ example: "Valeryn Duque" })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiPropertyOptional({
    description:
      "Slug de workspace a reclamar. Si el workspace aún no tiene miembros, el usuario se convierte en Owner.",
    example: "nv-streaming",
  })
  @IsOptional()
  @IsString()
  workspaceSlug?: string;
}
