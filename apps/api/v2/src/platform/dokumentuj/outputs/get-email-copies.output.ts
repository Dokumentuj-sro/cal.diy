import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsDate, IsEnum, IsInt, IsString, ValidateNested } from "class-validator";

import { ERROR_STATUS, SUCCESS_STATUS } from "@calcom/platform-constants";

export class EmailCopyOutput {
  @IsInt()
  @ApiProperty({ example: 1, description: "Monotonic id; use the last one as the next afterId" })
  id!: number;

  @IsString()
  @ApiProperty()
  bookingUid!: string;

  @IsString()
  @ApiProperty({ description: "Archive type of the e-mail (e.g. potvrzeni, prelozeno, zruseno, ostatni)" })
  type!: string;

  @IsString()
  @ApiProperty()
  recipient!: string;

  @IsString()
  @ApiProperty()
  subject!: string;

  @IsString()
  @ApiProperty()
  html!: string;

  @IsString()
  @ApiProperty()
  text!: string;

  @IsDate()
  @ApiProperty({ type: Date })
  sentAt!: Date;

  @IsString()
  @ApiProperty({ description: "Booking metadata.lead_id as a string, or an empty string when absent" })
  leadId!: string;
}

export class GetEmailCopiesOutput {
  @ApiProperty({ example: SUCCESS_STATUS, enum: [SUCCESS_STATUS, ERROR_STATUS] })
  @IsEnum([SUCCESS_STATUS, ERROR_STATUS])
  status!: typeof SUCCESS_STATUS | typeof ERROR_STATUS;

  @ApiProperty({ type: [EmailCopyOutput] })
  @ValidateNested({ each: true })
  @Type(() => EmailCopyOutput)
  data!: EmailCopyOutput[];
}
