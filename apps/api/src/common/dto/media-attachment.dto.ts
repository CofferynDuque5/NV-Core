import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength } from "class-validator";

/**
 * One uploaded media descriptor as the web sends it (campaigns, posts, social
 * publish). It MUST be a real DTO class used with `@ValidateNested` + `@Type`:
 * with the global ValidationPipe (whitelist + transform) a bare `object[]`
 * property gets its elements mangled into `[]`, which silently dropped every
 * campaign image ("the attachment disappears and only the text is sent").
 */
export class MediaAttachmentDto {
  /** Public https URL (ImgBB/Cloudinary) or a data: URL (AI flyer). */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(6_000_000)
  url?: string;

  @ApiPropertyOptional({ description: "image | video | document" })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  kind?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  mime?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  filename?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  path?: string;
}
