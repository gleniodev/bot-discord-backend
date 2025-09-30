import { Controller, Get } from '@nestjs/common';

@Controller()
export class HealthController {
  @Get('/')
  root() {
    return 'OK'; // Render vai usar isso no health check
  }

  @Get('/healthz')
  health() {
    return { status: 'ok', uptime: process.uptime() };
  }
}
