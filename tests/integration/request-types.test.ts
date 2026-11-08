import { beforeAll, describe, expect, it } from "vitest";
import type { ApiErrorBody, RequestTypesDTO } from "@/contracts/api";
import { apiAs, resetDb } from "../helpers/api";

// DS-16 · Каталог справок GET /api/request-types: полный список 11 типов, порядок сида,
// формат контракта. Гость — 401, сотрудник — 403 (маршрут для студентов).

beforeAll(async () => {
  await resetDb();
});

describe("GET /api/request-types", () => {
  it("отдаёт каталог: 11 типов, поля по контракту", async () => {
    const res = await apiAs("anna").get<RequestTypesDTO>("/api/request-types");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.body.items).toHaveLength(11);

    const study = res.body.items.find((t) => t.code === "study_cert")!;
    expect(study).toEqual({
      code: "study_cert",
      title: "Справка об обучении",
      hint: "Для работы, банка, соцзащиты, визы",
      synonyms: expect.arrayContaining(["виза"]),
      slaDays: 1,
      delivery: ["electronic", "original"],
      popular: true,
      formSchema: [
        {
          name: "destination",
          kind: "text",
          label: "Куда предоставляется справка",
          required: true,
          max: 120,
        },
        {
          name: "need_grades",
          kind: "select",
          label: "Нужны ли сведения об успеваемости",
          required: false,
          options: ["нет", "да"],
        },
        {
          name: "valid_through",
          kind: "text",
          label: "Срок действия справки (если требуется)",
          required: false,
          max: 40,
        },
      ],
    });

    // Все типы из сида присутствуют, порядок — sortOrder.
    expect(res.body.items.map((t) => t.code)).toEqual([
      "study_cert",
      "military_cert",
      "scholarship_cert",
      "pension_cert",
      "transcript",
      "dorm_cert",
      "app_academic_leave",
      "app_retake",
      "app_individual_plan",
      "app_free",
      "data_fix",
    ]);
  });

  it("заявления без доставки имеют пустой delivery, у data_fix — formSchema с полем field", async () => {
    const res = await apiAs("maxim").get<RequestTypesDTO>("/api/request-types");
    const app = res.body.items.find((t) => t.code === "app_free")!;
    expect(app.delivery).toEqual([]);
    const fix = res.body.items.find((t) => t.code === "data_fix")!;
    expect(fix.formSchema[0]).toMatchObject({ name: "field", kind: "select", required: true });
    expect(fix.formSchema[0]!.options).toContain("ФИО");
  });

  it("гость — 401, сотрудник — 403", async () => {
    const guest = await apiAs("guest").get("/api/request-types");
    expect(guest.status).toBe(401);
    expect((guest.body as ApiErrorBody).error.code).toBe("UNAUTHORIZED");
    const staff = await apiAs("elena").get("/api/request-types");
    expect(staff.status).toBe(403);
    expect((staff.body as ApiErrorBody).error.code).toBe("FORBIDDEN");
  });
});
