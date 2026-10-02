import { GetEmailCopiesInput } from "@/platform/dokumentuj/inputs/get-email-copies.input";
import { GetEmailCopiesOutput } from "@/platform/dokumentuj/outputs/get-email-copies.output";
import { EmailCopiesService } from "@/platform/dokumentuj/services/email-copies.service";
import { API_VERSIONS_VALUES } from "@/lib/api-versions";
import { API_KEY_OR_ACCESS_TOKEN_HEADER } from "@/lib/docs/headers";
import { GetUser } from "@/modules/auth/decorators/get-user/get-user.decorator";
import { Permissions } from "@/modules/auth/decorators/permissions/permissions.decorator";
import { ApiAuthGuard } from "@/modules/auth/guards/api-auth/api-auth.guard";
import { PermissionsGuard } from "@/modules/auth/guards/permissions/permissions.guard";
import { UserWithProfile } from "@/modules/users/users.repository";
import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiHeader, ApiOperation, ApiTags as DocsTags } from "@nestjs/swagger";

import { BOOKING_READ, SUCCESS_STATUS } from "@calcom/platform-constants";

@Controller({
  path: "/v2/dokumentuj/email-copies",
  version: API_VERSIONS_VALUES,
})
@UseGuards(ApiAuthGuard, PermissionsGuard)
@DocsTags("Dokumentuj")
@ApiHeader(API_KEY_OR_ACCESS_TOKEN_HEADER)
export class EmailCopiesController {
  constructor(private readonly emailCopiesService: EmailCopiesService) {}

  @Get("/")
  @Permissions([BOOKING_READ])
  @ApiOperation({
    summary: "Get archived booking e-mails",
    description:
      "Dokumentuj fork: copies of booking e-mails sent by Cal for bookings organized by the authenticated user, ordered by id. Page with afterId = last id seen; a page shorter than take means there are no more.",
  })
  async getEmailCopies(
    @GetUser() user: UserWithProfile,
    @Query() query: GetEmailCopiesInput
  ): Promise<GetEmailCopiesOutput> {
    const data = await this.emailCopiesService.getEmailCopies({
      userId: user.id,
      afterId: query.afterId,
      take: query.take,
    });
    return { status: SUCCESS_STATUS, data };
  }
}
