import { DEFAULT_TAKE, MAX_TAKE } from "@/platform/dokumentuj/services/email-copies.service";
import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsInt, IsOptional, Min } from "class-validator";

export class GetEmailCopiesInput {
  @ApiPropertyOptional({
    description: "Cursor: return only copies with id greater than this value",
    example: 0,
    default: 0,
    minimum: 0,
  })
  @Transform(({ value }: { value: string }) => (value ? parseInt(value, 10) : 0))
  @IsInt()
  @Min(0)
  @IsOptional()
  afterId: number = 0;

  @ApiPropertyOptional({
    description: `Maximum number of copies to return (values above ${MAX_TAKE} are clamped to ${MAX_TAKE})`,
    example: DEFAULT_TAKE,
    default: DEFAULT_TAKE,
    minimum: 1,
    maximum: MAX_TAKE,
  })
  @Transform(({ value }: { value: string }) => (value ? parseInt(value, 10) : DEFAULT_TAKE))
  @IsInt()
  @Min(1)
  @IsOptional()
  take: number = DEFAULT_TAKE;
}
