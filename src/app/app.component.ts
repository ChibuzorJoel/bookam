import { Component } from '@angular/core';
import { LayoutService } from './core/layout.service';
import { AuthService } from './services/auth.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent {
  title = 'bookam';

  // public so the template can access them
  constructor(
    public layout: LayoutService,
    public auth: AuthService
  ) {}
}