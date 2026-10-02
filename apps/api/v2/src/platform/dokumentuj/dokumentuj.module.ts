import { EmailCopiesController } from "@/platform/dokumentuj/email-copies.controller";
import { EmailCopiesService } from "@/platform/dokumentuj/services/email-copies.service";
import { OAuthClientModule } from "@/modules/oauth-clients/oauth-client.module";
import { PrismaModule } from "@/modules/prisma/prisma.module";
import { TokensModule } from "@/modules/tokens/tokens.module";
import { Module } from "@nestjs/common";

@Module({
  imports: [PrismaModule, TokensModule, OAuthClientModule],
  providers: [EmailCopiesService],
  controllers: [EmailCopiesController],
})
export class DokumentujModule {}
