import { Controller, Get } from "@nestjs/common";
import { ApiTags, ApiOperation } from "@nestjs/swagger";
import { ServiceTypesService } from "./service-types.service";

@ApiTags("service-types")
@Controller("service-types")
export class ServiceTypesController {
  constructor(private readonly serviceTypesService: ServiceTypesService) {}

  @Get()
  @ApiOperation({ summary: "List all service types" })
  findAll() {
    return this.serviceTypesService.findAll();
  }
}
