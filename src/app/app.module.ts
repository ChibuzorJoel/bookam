import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ReactiveFormsModule } from '@angular/forms';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { HomeComponent } from './pages/home/home.component';
import { HeaderComponent } from './layout/header/header.component';
import { FooterComponent } from './layout/footer/footer.component';
import { authInterceptor } from './core/auth.interceptor';
import { DashboardComponent } from './pages/dashboard/dashboard.component';
import { BusinessComponent } from './pages/business/business.component';
import { BookingConfirmationComponent } from './pages/booking-confirmation/booking-confirmation.component';
import { CatalogComponent } from './pages/catalog/catalog.component';
import { SettingsComponent } from './pages/settings/settings.component';
import { RecordsComponent } from './pages/records/records.component';
import { AnalyticsComponent } from './pages/analytics/analytics.component';
import { AdminComponent } from './pages/admin/admin.component';
import { AccountComponent } from './pages/account/account.component';
import { PricingComponent } from './pages/pricing/pricing.component';

@NgModule({
  // Only non-standalone components belong here
  declarations: [
    AppComponent,
    HomeComponent,
    HeaderComponent,
    FooterComponent,
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    ReactiveFormsModule,
    // Standalone components go in imports
    DashboardComponent,
    BusinessComponent,
    BookingConfirmationComponent,
    CatalogComponent,
    SettingsComponent,
    RecordsComponent,
    AnalyticsComponent,
    AdminComponent,
    AccountComponent,
    PricingComponent,
  ],
  providers: [provideHttpClient(withInterceptors([authInterceptor]))],
  bootstrap: [AppComponent],
})
export class AppModule {}