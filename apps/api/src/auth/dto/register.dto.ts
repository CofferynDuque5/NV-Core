import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsBoolean, IsEmail, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class RegisterDto {
  @ApiProperty({ example: "founder@empresa.com" })
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsEmail({}, { message: "Escribe un email válido (por ejemplo nombre@dominio.com)." })
  @MaxLength(254, { message: "El email es demasiado largo." })
  email!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8, { message: "La contraseña debe tener al menos 8 caracteres." })
  @MaxLength(128, { message: "La contraseña puede tener hasta 128 caracteres." })
  password!: string;

  @ApiProperty({ example: "Valeryn Duque" })
  // "   " is not a name: trim before checking the length.
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(2, { message: "Escribe tu nombre (al menos 2 letras)." })
  @MaxLength(80, { message: "El nombre puede tener hasta 80 caracteres." })
  name!: string;

  @ApiPropertyOptional({
    description:
      "Slug de workspace a reclamar. Si el workspace aún no tiene miembros, el usuario se convierte en Owner.",
    example: "nv-streaming",
  })
  @IsOptional()
  @IsString()
  workspaceSlug?: string;

  @ApiProperty({ description: "Debe ser true: el usuario acepta los Términos legales vigentes." })
  @IsOptional()
  @IsBoolean()
  acceptTerms?: boolean;
}
