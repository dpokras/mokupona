import { faker } from "@faker-js/faker";

import { readLatestMailTo, visitMailLink } from "../support/mail";

describe("smoke tests", () => {
  function fakeSignupForm() {
    const loginForm = {
      name: faker.person.fullName(),
      email: `${faker.internet.username()}@example.com`.toLowerCase(),
      password: faker.internet.password(),
    };
    cy.then(() => ({ email: loginForm.email })).as("user");
    return loginForm;
  }

  function submitJoinForm(loginForm: {
    name: string;
    email: string;
    password: string;
  }) {
    cy.findByRole("textbox", { name: /name/i }).type(loginForm.name);
    cy.findByRole("textbox", { name: /email/i }).type(loginForm.email);
    cy.findAllByLabelText(/password/i)
      .first()
      .type(loginForm.password);
    cy.findAllByLabelText(/password/i)
      .last()
      .type(loginForm.password);
    cy.findByRole("button", { name: /create account/i }).click();
    cy.location("pathname").should("equal", "/check-your-inbox");
  }

  function fillLoginForm(email: string, password: string) {
    cy.findByRole("textbox", { name: /email/i }).type(email);
    cy.findByLabelText(/^password$/i).type(password);
    cy.findByRole("button", { name: /log in/i }).click();
  }

  afterEach(() => {
    cy.cleanupUser();
  });

  it("should allow you to register, verify your email and login", () => {
    const loginForm = fakeSignupForm();

    cy.visitAndCheck("/");
    cy.findByRole("link", { name: /login/i }).should("not.exist");

    cy.visitAndCheck("/admin");
    cy.location("pathname").should("equal", "/login");
    cy.findAllByRole("link", { name: /sign up/i })
      .first()
      .click();

    submitJoinForm(loginForm);

    readLatestMailTo(loginForm.email).then((mail) => {
      visitMailLink(mail, "/verify-email");
    });
    cy.findByRole("heading", { name: /your email is verified/i });
    cy.findByRole("link", { name: /continue to log in/i }).click();

    fillLoginForm(loginForm.email, loginForm.password);

    cy.findByText(/doesn't have access to the admin area/i);
    cy.findByRole("button", { name: /log out/i }).click();
    cy.location("pathname").should("equal", "/");
  });

  it("should re-send the verification link on an unverified login attempt", () => {
    const loginForm = fakeSignupForm();

    cy.visitAndCheck("/join");
    submitJoinForm(loginForm);

    cy.visitAndCheck("/login");
    fillLoginForm(loginForm.email, loginForm.password);

    cy.findByText(/your email isn't verified yet/i);
    readLatestMailTo(loginForm.email).then((mail) => {
      expect(mail.sequence).to.be.greaterThan(1);
    });
  });

  it("should allow you to reset your password", () => {
    const newPassword = faker.internet.password();

    cy.login().then((user) => {
      const { email } = user;

      cy.clearCookie("better-auth.session_token");

      cy.visitAndCheck("/forgot-password");
      cy.findByRole("textbox", { name: /email/i }).type(email);
      cy.findByRole("button", { name: /send reset link/i }).click();
      cy.findByText(/if an account exists for/i);

      readLatestMailTo(email).then((mail) => {
        visitMailLink(mail, "/reset-password");
      });

      cy.findByLabelText(/^new password$/i).type(newPassword);
      cy.findByLabelText(/confirm new password/i).type(newPassword);
      cy.findByRole("button", { name: /save new password/i }).click();

      cy.findByRole("heading", { name: /password updated/i });
      cy.findByRole("link", { name: /continue to log in/i }).click();

      fillLoginForm(email, newPassword);
      cy.findByRole("button", { name: /logout/i });
    });
  });

  it("should allow you to join a dinner", () => {
    const testCredentials = {
      name: faker.person.fullName(),
      email: `${faker.internet.username()}@example.com`,
    };

    cy.login();
    cy.visitAndCheck("/");

    cy.findByRole("link", { name: /join a dinner/i }).click();
    cy.location("pathname").should("match", /^\/dinners\/[^/]+$/);

    cy.findByRole("textbox", { name: /name/i }).type(testCredentials.name);
    cy.findByRole("textbox", { name: /email/i }).type(testCredentials.email);
    cy.findByLabelText(/agree to the privacy policy/i).click();
    cy.findByRole("button", { name: /join/i }).click();
  });
});

describe("gallery", () => {
  it("renders the gallery page", () => {
    cy.visitAndCheck("/gallery");
    cy.findByRole("heading", { name: /gallery/i });
  });
});
