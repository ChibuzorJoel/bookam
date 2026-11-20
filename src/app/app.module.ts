import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ReactiveFormsModule } from '@angular/forms';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { HomeComponent } from './pages/home/home.component';
import { HeaderComponent } from './layout/header/header.component';
import { FooterComponent } from './layout/footer/footer.component';
import { AssistantComponent } from './pages/assistant/assistant.component';
import { authInterceptor } from './core/auth.interceptor';
import { ReviewsComponent } from './pages/reviews/reviews.component';
import { AlertsCardComponent } from './pages/alerts-card/alerts-card.component';



@NgModule({
  declarations: [AppComponent, HomeComponent, HeaderComponent, FooterComponent],
  imports: [BrowserModule, AppRoutingModule, ReactiveFormsModule, AssistantComponent],
  providers: [provideHttpClient(withInterceptors([authInterceptor]))],
  bootstrap: [AppComponent],
})
export class AppModule {}