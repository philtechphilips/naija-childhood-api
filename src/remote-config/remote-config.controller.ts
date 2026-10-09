import { Controller, Get, Header, Inject } from "@nestjs/common";
import { RemoteConfigService } from "./remote-config.service";

@Controller("config")
export class RemoteConfigController {
  constructor(@Inject(RemoteConfigService) private readonly svc: RemoteConfigService) {}

  @Get()
  @Header("Cache-Control", "public, max-age=60, stale-while-revalidate=600")
  get() {
    return this.svc.get();
  }
}
