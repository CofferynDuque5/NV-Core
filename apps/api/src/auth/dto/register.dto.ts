import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsBoolean, IsEmail, IsOptional, IsString, MinLength } from "class-validator";

export class RegisterDto {
  @ApiProperty({ example: "founder@empresa.com" })
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({ example: "Valeryn Duque" })
  // "   " is not a name: trim before checking the length.
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(2, { message: "Escribe tu nombre (al menos 2 letras)." })
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
