import { Controller, Get } from "@nestjs/common";
import { ApiTags, ApiOperation } from "@nestjs/swagger";
import { DealershipsService } from "./dealerships.service";

@ApiTags("dealerships")
@Controller("dealerships")
export class DealershipsController {
  constructor(private readonly dealershipsService: DealershipsService) {}

  @Get()
  @ApiOperation({ summary: "List all dealerships" })
  findAll() {
    return this.dealershipsService.findAll();
  }
}
