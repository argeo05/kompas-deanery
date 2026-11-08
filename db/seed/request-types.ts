import type { Delivery, FormFieldSchema } from "../../src/contracts/api";

// Каталог справок и заявлений (SPEC §6.5, таблица «Каталог»; §6.1 п.12 — data_fix).
// Правила вымышленные. synonyms и formSchema дополняет тикет DS-42.
// label — техническая подпись из сида; финальные формулировки в UI правит Claude (DEEPSEEK-TASKS DS-16).

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
    synonyms: ["виза", "справка", "на работу", "в банк", "учусь", "форма 9"],
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
  },
  {
    code: "military_cert",
    title: "Справка для военкомата (форма 26)",
    hint: "Отсрочка от призыва",
    slaDays: 3,
    deliveryOptions: ["original"],
    popular: true,
    synonyms: ["военкомат", "форма 26", "отсрочка", "призыв"],
    formSchema: [
      {
        name: "military_office",
        kind: "text",
        label: "Название военкомата, куда предоставляется справка",
        required: true,
        max: 120,
      },
      {
        name: "copies_note",
        kind: "text",
        label: "Комментарий к экземплярам (необязательно)",
        required: false,
        max: 120,
      },
    ],
  },
  {
    code: "scholarship_cert",
    title: "Справка о размере стипендии",
    hint: "Для соцзащиты, субсидий",
    slaDays: 2,
    deliveryOptions: ["electronic", "original"],
    popular: true,
    synonyms: ["стипуха", "стипендия", "соцзащита", "субсидия", "выплаты"],
    formSchema: [
      {
        name: "period",
        kind: "text",
        label: "Период, за который нужна справка (например, «сентябрь–ноябрь 2026»)",
        required: true,
        max: 60,
      },
      {
        name: "destination",
        kind: "text",
        label: "Куда предоставляется справка",
        required: false,
        max: 120,
      },
    ],
  },
  {
    code: "pension_cert",
    title: "Справка для пенсионного фонда",
    hint: "Пенсия по потере кормильца",
    slaDays: 3,
    deliveryOptions: ["original"],
    popular: false,
    synonyms: ["сфр", "пенсионный фонд", "пенсия по потере кормильца", "кормилец"],
    formSchema: [
      {
        name: "period",
        kind: "text",
        label: "Период, за который нужна справка",
        required: true,
        max: 60,
      },
      {
        name: "kinship",
        kind: "text",
        label: "Уточнение для фонда (если required в форме фонда)",
        required: false,
        max: 120,
      },
    ],
  },
  {
    code: "transcript",
    title: "Выписка оценок (академическая справка)",
    hint: "Для перевода, стажировки, обмена",
    slaDays: 5,
    deliveryOptions: ["electronic", "original"],
    popular: false,
    synonyms: ["оценки", "академическая справка", "выписка", "перевод", "обмен", "стажировка"],
    formSchema: [
      {
        name: "semester",
        kind: "select",
        label: "За какой период выписка",
        required: false,
        options: [
          "все семестры",
          "текущий семестр",
          "1 семестр",
          "2 семестр",
          "3 семестр",
          "4 семестр",
        ],
      },
      {
        name: "destination",
        kind: "text",
        label: "Куда предоставляется выписка",
        required: false,
        max: 120,
      },
    ],
  },
  {
    code: "dorm_cert",
    title: "Справка для общежития",
    hint: "Заселение, продление",
    slaDays: 2,
    deliveryOptions: ["electronic"],
    popular: false,
    synonyms: ["общежитие", "общага", "заселение", "продление", "посёлка"],
    formSchema: [
      {
        name: "destination",
        kind: "select",
        label: "Для чего справка",
        required: true,
        options: ["заселение", "продление"],
      },
      {
        name: "dorm",
        kind: "text",
        label: "Общежитие (корпус), если важно",
        required: false,
        max: 60,
      },
    ],
  },
  {
    code: "app_academic_leave",
    title: "Заявление на академический отпуск",
    hint: "По медицинским и иным основаниям",
    slaDays: 10,
    deliveryOptions: [],
    popular: false,
    synonyms: ["академ", "академический отпуск", "перерыв в учёбе", "отпуск"],
    formSchema: [
      {
        name: "reason",
        kind: "textarea",
        label: "Основание (причина и желаемые сроки отпуска)",
        required: true,
        max: 2000,
      },
      {
        name: "from_date",
        kind: "text",
        label: "С какой даты (пример: «с 01.12.2026»)",
        required: false,
        max: 40,
      },
      {
        name: "until_date",
        kind: "text",
        label: "По какую дату",
        required: false,
        max: 40,
      },
    ],
  },
  {
    code: "app_retake",
    title: "Заявление на пересдачу",
    hint: "При академической задолженности",
    slaDays: 3,
    deliveryOptions: [],
    popular: false,
    synonyms: ["пересдача", "неудовлетворительная", "хвост", "академическая задолженность"],
    formSchema: [
      {
        name: "course",
        kind: "text",
        label: "Дисциплина, по которой нужна пересдача",
        required: true,
        max: 120,
      },
      {
        name: "attempt",
        kind: "select",
        label: "Попытка",
        required: false,
        options: ["первая", "вторая (комиссия)"],
      },
      {
        name: "comment",
        kind: "textarea",
        label: "Комментарий (необязательно)",
        required: false,
        max: 1000,
      },
    ],
  },
  {
    code: "app_individual_plan",
    title: "Заявление на индивидуальный график",
    hint: "Работа, спорт, семейные обстоятельства",
    slaDays: 10,
    deliveryOptions: [],
    popular: false,
    synonyms: ["индивидуальный график", "свобо дный график", "работа", "спорт", "график"],
    formSchema: [
      {
        name: "reason",
        kind: "textarea",
        label: "Основание (причина и желаемый режим занятий)",
        required: true,
        max: 2000,
      },
      {
        name: "semester",
        kind: "text",
        label: "Семестр, на который рассчитываете (пример: «весна 2027»)",
        required: false,
        max: 40,
      },
    ],
  },
  {
    code: "app_free",
    title: "Свободное заявление",
    hint: "Если нужного типа нет",
    slaDays: 5,
    deliveryOptions: [],
    popular: false,
    synonyms: ["заявление", "иначе", "другое", "не стандартное"],
    formSchema: [
      {
        name: "body",
        kind: "textarea",
        label: "Содержание обращения (что именно вы просите)",
        required: true,
        max: 2000,
      },
    ],
  },
  {
    code: "data_fix",
    title: "Исправление личных данных",
    hint: "ФИО, группа или контакты указаны неверно",
    slaDays: 3,
    deliveryOptions: [],
    popular: false,
    synonyms: ["ошибка в документах", "исправить ФИО", "имя", "данные", "ошибка"],
    formSchema: [
      {
        name: "field",
        kind: "select",
        label: "Какие данные исправить",
        required: true,
        // Машинные коды контракта DataFixField; подписи (ФИО, группа…) — в UI.
        options: ["fullName", "group", "program", "contacts", "other"],
      },
      {
        name: "comment",
        kind: "textarea",
        label: "Что исправить и как должно быть",
        required: true,
        max: 1000,
      },
    ],
  },
];
