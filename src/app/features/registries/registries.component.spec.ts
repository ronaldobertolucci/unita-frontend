import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { RegistriesComponent } from './registries.component';

describe('RegistriesComponent', () => {
  let fixture: ComponentFixture<RegistriesComponent>;
  let component: RegistriesComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [RegistriesComponent, RouterTestingModule],
    });

    fixture = TestBed.createComponent(RegistriesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create the component', () => {
    expect(component).toBeTruthy();
  });

  it('should render the page title', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h2')?.textContent).toContain('Cadastros');
  });

  it('should render the three sub-nav links', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const links = compiled.querySelectorAll('a.sub-nav-item');
    expect(links.length).toBe(4);
  });

  it('should have correct routerLink for empresas', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const links = compiled.querySelectorAll('a.sub-nav-item');
    expect(links[0].getAttribute('href')).toContain('empresas');
  });

  it('should have correct routerLink for empregadores-pf', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const links = compiled.querySelectorAll('a.sub-nav-item');
    expect(links[1].getAttribute('href')).toContain('empregadores-pf');
  });

  it('should have correct routerLink for empregadores-pj', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const links = compiled.querySelectorAll('a.sub-nav-item');
    expect(links[2].getAttribute('href')).toContain('empregadores-pj');
  });
});