import { Controller, Get, Query, BadRequestException } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiQuery } from "@nestjs/swagger";
import { ServiceBaysService } from "./service-bays.service";

@ApiTags("service-bays")
@Controller("service-bays")
export class ServiceBaysController {
  constructor(private readonly serviceBaysService: ServiceBaysService) {}

  @Get()
  @ApiOperation({ summary: "List active service bays for a dealership" })
  @ApiQuery({ name: "dealershipId", required: true })
  findByDealership(@Query("dealershipId") dealershipId: string) {
    if (!dealershipId) {
      throw new BadRequestException("dealershipId is required");
    }
    return this.serviceBaysService.findByDealership(dealershipId);
  }
}
