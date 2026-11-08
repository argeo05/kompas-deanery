import { beforeAll, describe, expect, it } from "vitest";
import type { ApiErrorBody, MeDTO } from "@/contracts/api";
import { apiAs, resetDb } from "../helpers/api";

// DS-10 · Профиль студента (GET/PATCH /api/me). Успех, валидация, игнор чужих полей,
// гость без сессии — 401, сотрудник — 403, PATCH не меняет ничего кроме displayName/onboardingDone.

beforeAll(async () => {
  await resetDb();
});

const BODY = {
  userId: expect.any(String),
  login: "anna.demo",
  role: "student",
  fullName: { last: "Соколова", first: "Анна", middle: "Дмитриевна" },
  displayName: "Аня",
  faculty: { id: expect.any(String), title: "Факультет экономики" },
  program: { id: expect.any(String), code: "38.03.01", title: "Экономика", level: "bachelor" },
  course: 1,
  group: { id: expect.any(String), title: "Б-ЭК-101" },
  studyForm: "full_time",
  studentCardNo: "DEMO-260101",
  admissionYear: 2026,
  status: "studying",
  onboardingDone: false,
} as const;

describe("GET /api/me", () => {
  it("профиль в формате контракта", async () => {
    const res = await apiAs("anna").get<MeDTO>("/api/me");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.body).toEqual(BODY);
  });

  it("гость — 401 UNAUTHORIZED", async () => {
    const res = await apiAs("guest").get("/api/me");
    expect(res.status).toBe(401);
    expect((res.body as ApiErrorBody).error.code).toBe("UNAUTHORIZED");
  });

  it("сотрудник — 403 FORBIDDEN", async () => {
    const res = await apiAs("elena").get("/api/me");
    expect(res.status).toBe(403);
    expect((res.body as ApiErrorBody).error.code).toBe("FORBIDDEN");
  });

  it("studentId в query игнорируется — Максим получает только свой профиль", async () => {
    const res = await apiAs("maxim").get<MeDTO>("/api/me?studentId=любая-подстановка&userId=x");
    expect(res.status).toBe(200);
    expect(res.body.fullName.last).toBe("Орлов");
    expect(res.body.login).toBe("maxim.demo");
  });
});

describe("PATCH /api/me", () => {
  it("меняет displayName и onboardingDone, отвечает обновлённым профилем", async () => {
    const res = await apiAs("anna").patch<MeDTO>("/api/me", {
      displayName: "Аня С.",
      onboardingDone: true,
      role: "admin", // лишнее — игнорируется
      studentCardNo: "DEMO-999999", // лишнее — игнорируется
    });
    expect(res.status).toBe(200);
    expect(res.body.displayName).toBe("Аня С.");
    expect(res.body.onboardingDone).toBe(true);
    expect(res.body.studentCardNo).toBe("DEMO-260101");

    const reload = await apiAs("anna").get<MeDTO>("/api/me");
    expect(reload.body.displayName).toBe("Аня С.");
    expect(reload.body.onboardingDone).toBe(true);
  });

  it("пустое тело — 200, ничего не меняется (все поля optional)", async () => {
    const res = await apiAs("anna").patch<MeDTO>("/api/me", {});
    expect(res.status).toBe(200);
    expect(res.body.displayName).toBe("Аня С.");
  });

  it("валидация: displayName ≤ 40 символов, trim применяется", async () => {
    const tooLong = await apiAs("anna").patch<ApiErrorBody>("/api/me", {
      displayName: "д".repeat(41),
    });
    expect(tooLong.status).toBe(422);
    expect(tooLong.body.error.code).toBe("VALIDATION");

    const spaced = await apiAs("anna").patch<MeDTO>("/api/me", { displayName: "  Аня  " });
    expect(spaced.status).toBe(200);
    expect(spaced.body.displayName).toBe("Аня");
  });

  it("гость — 401, сотрудник — 403", async () => {
    const guest = await apiAs("guest").patch("/api/me", { displayName: "x" });
    expect(guest.status).toBe(401);
    const staff = await apiAs("elena").patch("/api/me", { displayName: "x" });
    expect(staff.status).toBe(403);
  });

  it("Максим не может менять чужой displayName даже подставив userId", async () => {
    const res = await apiAs("maxim").patch<MeDTO>("/api/me", {
      displayName: "Взлом",
      userId: "любая-подстановка",
    });
    expect(res.status).toBe(200);
    const anna = await apiAs("anna").get<MeDTO>("/api/me");
    expect(anna.body.displayName).toBe("Аня");
  });
});
