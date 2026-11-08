import type { Delivery, FormFieldSchema } from "../../src/contracts/api";

// Каталог справок и заявлений (SPEC §6.5, таблица «Каталог»; §6.1 п.12 — data_fix).
// Правила вымышленные. synonyms и formSchema дополняет тикет DS-42.

export interface RequestTypeSeed {
  code: string;
  title: string;
  hint: string;
  slaDays: number;
  deliveryOptions: Delivery[];
  popular: boolean;
  synonyms: string[];
  formSchema: FormFieldSchema[];
}

export const REQUEST_TYPES: RequestTypeSeed[] = [
  {
    code: "study_cert",
    title: "Справка об обучении",
    hint: "Для работы, банка, соцзащиты, визы",
    slaDays: 1,
    deliveryOptions: ["electronic", "original"],
    popular: true,
    synonyms: [],
    formSchema: [],
  },
  {
    code: "military_cert",
    title: "Справка для военкомата (форма 26)",
    hint: "Отсрочка от призыва",
    slaDays: 3,
    deliveryOptions: ["original"],
    popular: true,
    synonyms: [],
    formSchema: [],
  },
  {
    code: "scholarship_cert",
    title: "Справка о размере стипендии",
    hint: "Для соцзащиты, субсидий",
    slaDays: 2,
    deliveryOptions: ["electronic", "original"],
    popular: true,
    synonyms: [],
    formSchema: [],
  },
  {
    code: "pension_cert",
    title: "Справка для пенсионного фонда",
    hint: "Пенсия по потере кормильца",
    slaDays: 3,
    deliveryOptions: ["original"],
    popular: false,
    synonyms: [],
    formSchema: [],
  },
  {
    code: "transcript",
    title: "Выписка оценок (академическая справка)",
    hint: "Для перевода, стажировки, обмена",
    slaDays: 5,
    deliveryOptions: ["electronic", "original"],
    popular: false,
    synonyms: [],
    formSchema: [],
  },
  {
    code: "dorm_cert",
    title: "Справка для общежития",
    hint: "Заселение, продление",
    slaDays: 2,
    deliveryOptions: ["electronic"],
    popular: false,
    synonyms: [],
    formSchema: [],
  },
  {
    code: "app_academic_leave",
    title: "Заявление на академический отпуск",
    hint: "По медицинским и иным основаниям",
    slaDays: 10,
    deliveryOptions: [],
    popular: false,
    synonyms: [],
    formSchema: [],
  },
  {
    code: "app_retake",
    title: "Заявление на пересдачу",
    hint: "При академической задолженности",
    slaDays: 3,
    deliveryOptions: [],
    popular: false,
    synonyms: [],
    formSchema: [],
  },
  {
    code: "app_individual_plan",
    title: "Заявление на индивидуальный график",
    hint: "Работа, спорт, семейные обстоятельства",
    slaDays: 10,
    deliveryOptions: [],
    popular: false,
    synonyms: [],
    formSchema: [],
  },
  {
    code: "app_free",
    title: "Свободное заявление",
    hint: "Если нужного типа нет",
    slaDays: 5,
    deliveryOptions: [],
    popular: false,
    synonyms: [],
    formSchema: [],
  },
  {
    code: "data_fix",
    title: "Исправление личных данных",
    hint: "ФИО, группа или контакты указаны неверно",
    slaDays: 3,
    deliveryOptions: [],
    popular: false,
    synonyms: [],
    formSchema: [],
  },
];
