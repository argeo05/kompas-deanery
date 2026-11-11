// Контракты API «Компаса» — общий источник правды для UI и обработчиков (DEEPSEEK-TASKS §2, §4).
// Меняет только Claude. Нужна правка — вопрос в docs/ds-questions/.
// Только типы: файл импортируется и на сервере, и в браузере.

// ── Общие ───────────────────────────────────────────────────────────────────

/** ISO 8601 с часовым поясом, например "2026-11-12T09:30:00+03:00" (Москва). */
export type ISODateTime = string;
/** Календарная дата "2026-11-12". */
export type ISODate = string;
export type UUID = string;

/** Курсорная пагинация: limit по умолчанию 20, максимум 50. nextCursor = null — дальше пусто. */
export interface Paged<T> {
  items: T[];
  nextCursor: string | null;
}

export type ErrorCode =
  | "NOT_FOUND"
  | "VALIDATION"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "INTERNAL";

/** Любой ответ с ошибкой. В API только машинный code, тексты для людей пишет UI. */
export interface ApiErrorBody {
  error: { code: ErrorCode; details?: unknown };
}

/** details для VALIDATION: список нарушений схемы Zod. */
export interface ValidationIssue {
  path: string;
  code: string;
}

export type Role = "student" | "staff" | "admin";

// ── Профиль (DS-10) ─────────────────────────────────────────────────────────

export type ProgramLevel = "bachelor" | "master" | "specialist" | "postgraduate";
export type StudyForm = "full_time" | "part_time" | "evening";
export type StudentStatus = "studying" | "academic_leave";

export interface MeDTO {
  userId: UUID;
  login: string;
  role: "student";
  fullName: { last: string; first: string; middle: string | null };
  displayName: string;
  faculty: { id: UUID; title: string };
  program: { id: UUID; code: string; title: string; level: ProgramLevel };
  course: number;
  group: { id: UUID; title: string };
  studyForm: StudyForm;
  /** Формат "DEMO-…". */
  studentCardNo: string;
  admissionYear: number;
  status: StudentStatus;
  onboardingDone: boolean;
}

/** PATCH /api/me — остальные поля тела игнорируются. */
export interface MePatchBody {
  displayName?: string;
  onboardingDone?: boolean;
}

// ── Расписание (DS-11) ──────────────────────────────────────────────────────

export type ClassType = "lecture" | "seminar" | "practice" | "exam" | "consultation";
export type WeekParity = "odd" | "even";
export type ScheduleChangeType =
  "cancelled" | "moved" | "room_changed" | "teacher_changed" | "added";

export interface ScheduleChangeDTO {
  id: UUID;
  type: ScheduleChangeType;
  previous: { startsAt: ISODateTime; endsAt: ISODateTime; roomNumber: string } | null;
  reason: string | null;
  createdAt: ISODateTime;
  seen: boolean;
}

export interface ClassDTO {
  id: UUID;
  /** colorIndex 0..9 */
  course: { id: UUID; title: string; shortTitle: string; colorIndex: number };
  type: ClassType;
  /** Уже с учётом переноса. */
  startsAt: ISODateTime;
  endsAt: ISODateTime;
  room: { id: UUID; building: string; number: string; floor: number | null; hint: string | null };
  teacher: { id: UUID; fullName: string; email: string | null; officeHours: string | null };
  weekParity: WeekParity | null;
  change: ScheduleChangeDTO | null;
  /** Личная заметка студента. */
  note: string | null;
}

export interface ScheduleDTO {
  from: ISODate;
  to: ISODate;
  weekNumber: number;
  weekParity: WeekParity | null;
  classes: ClassDTO[];
  /** «Призраки» перенесённых пар на старом месте (SPEC §6.3 п.5). */
  ghostSlots: Array<{ classId: UUID; originalStartsAt: ISODateTime; movedTo: ISODateTime }>;
}

/** POST /api/me/schedule/changes/seen → 204 */
export interface ScheduleChangesSeenBody {
  changeIds: UUID[];
}

/** PUT /api/me/classes/:classId/note — пустая строка удаляет заметку. */
export interface ClassNoteBody {
  text: string;
}
export interface ClassNoteDTO {
  note: string | null;
}

// ── Успеваемость (DS-03, DS-04, DS-12, DS-13) ───────────────────────────────

export type ControlType = "exam" | "credit" | "graded_credit";
export type Mark = 2 | 3 | 4 | 5;
export interface MarkDTO {
  value: Mark;
  word: string;
  letter: string;
}

export type SemesterStatus = "ok" | "risk" | "action";
export type SemesterStatusReason = "NEED_OVER_70" | "MISSED_DEADLINE" | "NOT_ADMITTED" | "DEBT";

export interface GradesDTO {
  semester: string;
  /** Список семестров для переключателя. */
  semesters: string[];
  status: {
    status: SemesterStatus;
    reasons: Array<{ courseId: UUID; reason: SemesterStatusReason }>;
  };
  /** 1 знак после запятой. */
  averagePreliminary: number | null;
  daysToSession: number | null;
  courses: Array<{
    courseId: UUID;
    title: string;
    control: ControlType;
    total: number;
    /** Для кольца прогресса. */
    maxSoFar: number;
    mark: MarkDTO | null;
    /** Только для зачёта. */
    credit: { passed: boolean | null; conditions: Array<{ label: string; met: boolean }> } | null;
    risk: boolean;
  }>;
}

export interface CourseGradesDTO {
  courseId: UUID;
  title: string;
  teacher: { fullName: string; email: string | null; officeHours: string | null };
  control: ControlType;
  rulesText: string;
  items: Array<{
    id: UUID;
    title: string;
    type: string;
    dueAt: ISODateTime | null;
    score: number | null;
    max: number;
    weight: number;
    gradedAt: ISODateTime | null;
  }>;
  history: Array<{
    itemId: UUID;
    oldScore: number | null;
    newScore: number;
    changedAt: ISODateTime;
    changedBy: string;
  }>;
  total: number;
  mark: MarkDTO | null;
  needed: Array<{ target: 3 | 4 | 5; needed: number; achievable: boolean }>;
  /** Сравнение с целью делает Claude (SPEC §6.4 п.9); в эндпоинте всегда null. */
  peerGoal: null;
}

// ── Сессия (DS-14) ──────────────────────────────────────────────────────────

export interface SessionDTO {
  startsOn: ISODate | null;
  endsOn: ISODate | null;
  items: Array<{
    id: UUID;
    courseTitle: string;
    type: ControlType;
    startsAt: ISODateTime;
    room: string;
    consultationAt: ISODateTime | null;
    admitted: boolean | null;
    admissionReason: string | null;
  }>;
}

// ── Дедлайны и планы (DS-05, DS-15) ─────────────────────────────────────────

export type DeadlineSource = "assessment" | "admin" | "personal";

export interface PlanDTO {
  id: UUID;
  startsAt: ISODateTime;
  endsAt: ISODateTime;
  place: string;
  firstAction: string;
}

export interface DeadlineDTO {
  id: UUID;
  source: DeadlineSource;
  title: string;
  courseTitle: string | null;
  dueAt: ISODateTime;
  starred: boolean;
  done: boolean;
  risk: boolean;
  plan: PlanDTO | null;
}

/** GET /api/me/deadlines — hot = ≤ 48 ч. */
export interface DeadlinesDTO {
  groups: { hot: DeadlineDTO[]; week: DeadlineDTO[]; later: DeadlineDTO[]; done: DeadlineDTO[] };
}

export interface DeadlineCreateBody {
  title: string;
  dueAt: ISODateTime;
}

export interface TimeWindow {
  startsAt: ISODateTime;
  endsAt: ISODateTime;
}
/** GET /api/me/deadlines/:id/windows — 3 ближайших окна. */
export interface DeadlineWindowsDTO {
  windows: TimeWindow[];
}

export interface PlanCreateBody {
  deadlineId: UUID;
  startsAt: ISODateTime;
  endsAt: ISODateTime;
  place: string;
  firstAction: string;
}

// ── Заявки (DS-06, DS-16, DS-17) ────────────────────────────────────────────

export type RequestStatus =
  "submitted" | "in_progress" | "needs_info" | "ready" | "issued" | "rejected" | "cancelled";
export type RequestAction =
  "take" | "need_info" | "student_reply" | "ready" | "issue" | "reject" | "cancel";
export type Delivery = "electronic" | "original";
export type RejectReason = "INCOMPLETE" | "NOT_ELIGIBLE" | "DUPLICATE" | "OTHER";

export interface FormFieldSchema {
  name: string;
  kind: "text" | "select" | "number" | "textarea";
  /** Техническая подпись из сида; финальные формулировки — в UI. */
  label: string;
  required: boolean;
  options?: string[];
  min?: number;
  max?: number;
}

export interface RequestTypeDTO {
  code: string;
  title: string;
  hint: string;
  synonyms: string[];
  slaDays: number;
  delivery: Delivery[];
  popular: boolean;
  formSchema: FormFieldSchema[];
}
/** GET /api/request-types */
export interface RequestTypesDTO {
  items: RequestTypeDTO[];
}

/** Вкладки «Мои заявки»: active — submitted…ready, archive — issued, rejected, cancelled. */
export type RequestsTab = "active" | "archive" | "all";

/** Заявка в списке и в ответах на действия (создание, отмена, ответ). */
export interface RequestDTO {
  id: UUID;
  /** Человекочитаемый номер "СП-2611-0042". В URL не используется. */
  number: string;
  type: { code: string; title: string };
  status: RequestStatus;
  /** null — заявление: документ не выдаётся. */
  delivery: Delivery | null;
  copies: number;
  createdAt: ISODateTime;
  /** Ожидаемая готовность с учётом рабочих дней (DS-01). */
  dueAt: ISODateTime;
  /** Время последнего события заявки. */
  updatedAt: ISODateTime;
  /** Срок прошёл, а заявка ещё не готова. */
  overdue: boolean;
  /** Есть событие, которое студент ещё не видел (точка в списке). */
  unseen: boolean;
  /** Если заявка подана заново после отказа — id исходной. */
  resubmittedFrom: UUID | null;
}

export type ActorKind = "student" | "staff" | "system";

export interface RequestEventDTO {
  id: UUID;
  /** null — создание заявки. */
  fromStatus: RequestStatus | null;
  toStatus: RequestStatus;
  actor: ActorKind;
  /** Для сотрудника — «Елена С.», для студента и системы — null (подписи делает UI). */
  actorName: string | null;
  comment: string | null;
  createdAt: ISODateTime;
}

export interface MessageDTO {
  id: UUID;
  author: "student" | "staff";
  authorName: string;
  /** Текст как есть; экранирует UI. */
  body: string;
  createdAt: ISODateTime;
}

/** GET /api/me/requests/:id — карточка заявки. */
export interface RequestDetailDTO extends RequestDTO {
  /** Поля формы по formSchema типа. */
  fields: Record<string, string | number>;
  /** Ответственный: «Елена С.», «Студенческий офис». */
  assignee: { name: string; unit: string } | null;
  rejection: { reason: RejectReason; comment: string | null } | null;
  /** Трекер — только реальные события, по времени (SPEC §6.5 п.11). */
  events: RequestEventDTO[];
  messages: MessageDTO[];
  /** Выданный электронный документ, если есть. */
  document: { id: UUID; fileUrl: string } | null;
  /** Где забрать оригинал (из справочника подразделений). */
  pickup: { place: string; hours: string } | null;
}

export interface RequestCreateBody {
  typeCode: string;
  /** null — для типов без способов получения (заявления). */
  delivery: Delivery | null;
  /** 1–5 */
  copies: number;
  fields: Record<string, string | number>;
}

export interface RequestMessageBody {
  /** 1–2000 символов. */
  body: string;
}
/** POST /api/me/requests/:id/messages → 201 */
export interface RequestMessageCreatedDTO {
  message: MessageDTO;
  request: RequestDTO;
}

export interface RequestResubmitBody {
  fields?: Record<string, string | number>;
}

export type DataFixField = "fullName" | "group" | "program" | "contacts" | "other";
export interface DataFixBody {
  field: DataFixField;
  /** 1–1000 символов. */
  comment: string;
}

// ── Уведомления (DS-02, DS-18) ──────────────────────────────────────────────

export type NotificationClass = "urgent" | "personal" | "info";
export type NotificationCategory =
  "schedule" | "request" | "grade" | "deadline" | "announcement" | "ticket" | "plan";
export type NotificationLinkKind =
  "class" | "request" | "course" | "deadline" | "announcement" | "ticket";

export interface NotificationDTO {
  id: UUID;
  class: NotificationClass;
  category: NotificationCategory;
  title: string;
  body: string;
  link: { kind: NotificationLinkKind; id: UUID };
  createdAt: ISODateTime;
  deliverAt: ISODateTime;
  readAt: ISODateTime | null;
}

export type NotificationsTab = "all" | "important" | "announcements";

/** GET /api/me/notifications */
export type NotificationsDTO = Paged<NotificationDTO> & {
  unread: { urgent: number; personal: number; info: number };
};

/** POST /api/me/notifications/read → 204 */
export type NotificationsReadBody = { ids: UUID[] } | { all: true };

export interface NotificationPrefsDTO {
  /** 1–4 слота, минуты от полуночи МСК 0–1439, по возрастанию. */
  slots: number[];
  preset: "default" | "evening" | "custom";
  quietFrom: number;
  quietTo: number;
  immediateCategories: NotificationCategory[];
  /** schedule выключить нельзя (422). */
  disabledCategories: NotificationCategory[];
}

// ── Документы (DS-19, DS-23) ────────────────────────────────────────────────

export interface DocumentDTO {
  id: UUID;
  requestId: UUID;
  typeTitle: string;
  issuedAt: ISODateTime;
  verifyUrl: string;
  /** /api/me/documents/:id/file */
  fileUrl: string;
}
export interface DocumentsDTO {
  items: DocumentDTO[];
}

/** GET /api/verify/:code — без ФИО, группы и номера заявки. Всегда 200. */
export type VerifyDTO =
  { found: true; typeTitle: string; issuedAt: ISODateTime; valid: boolean } | { found: false };

// ── Главная «Сегодня» (DS-07, DS-20) ────────────────────────────────────────

export type Hero =
  | { kind: "change"; classId: UUID; change: ScheduleChangeDTO }
  | { kind: "now"; classId: UUID; endsAt: ISODateTime }
  | { kind: "soon"; classId: UUID; startsAt: ISODateTime }
  | { kind: "done_today"; nextClassAt: ISODateTime | null }
  | { kind: "day_off"; nextClassAt: ISODateTime | null };

export type HotItem =
  { kind: "deadline"; deadline: DeadlineDTO } | { kind: "request"; request: RequestDTO };

export interface TodayDTO {
  now: ISODateTime;
  greeting: "morning" | "day" | "evening" | "night";
  hero: Hero;
  /** Пары сегодня, по времени. */
  classes: ClassDTO[];
  passedCount: number;
  /** ≤ 3: дедлайны ≤ 48 ч, заявки ready/needs_info. */
  hot: HotItem[];
  /** ≤ 2 */
  news: Array<{ id: UUID; title: string; important: boolean; publishedAt: ISODateTime }>;
  dataAsOf: ISODateTime;
}

// ── Объявления (DS-31) ──────────────────────────────────────────────────────

export interface AnnouncementAudience {
  facultyIds?: UUID[];
  courses?: number[];
  groupIds?: UUID[];
}

/** GET /api/me/announcements — для студента. bodyMd — Markdown; в HTML его превращает UI через санитайзер. */
export interface AnnouncementDTO {
  id: UUID;
  title: string;
  bodyMd: string;
  important: boolean;
  publishedAt: ISODateTime;
  expiresAt: ISODateTime | null;
}

export interface StaffAnnouncementDTO extends AnnouncementDTO {
  audience: AnnouncementAudience;
  publishAt: ISODateTime;
  archivedAt: ISODateTime | null;
  author: string;
}

export interface AnnouncementCreateBody {
  title: string;
  bodyMd: string;
  audience: AnnouncementAudience;
  important: boolean;
  publishAt?: ISODateTime;
  expiresAt?: ISODateTime;
}

// ── Обращения (DS-21, DS-33) ────────────────────────────────────────────────

export type TicketTopic = "schedule" | "grades" | "requests" | "dorm" | "scholarship" | "other";
export type TicketStatus = "open" | "answered" | "closed";

export interface TicketDTO {
  id: UUID;
  topic: TicketTopic;
  status: TicketStatus;
  createdAt: ISODateTime;
  lastMessageAt: ISODateTime;
  unread: boolean;
}
export interface TicketsDTO {
  items: TicketDTO[];
}
export type TicketDetailDTO = TicketDTO & { messages: MessageDTO[] };

export interface TicketCreateBody {
  topic: TicketTopic;
  /** 1–2000 символов. */
  body: string;
  link?: { kind: "class" | "request" | "course"; id: UUID };
}

export interface StaffTicketRowDTO extends TicketDTO {
  student: { fullName: string; group: string };
}
export type StaffTicketDetailDTO = StaffTicketRowDTO & { messages: MessageDTO[] };

// ── Календарь ICS (DS-22) ───────────────────────────────────────────────────

/** GET /api/me/ics, POST /api/me/ics/rotate */
export interface IcsUrlDTO {
  url: string;
}

// ── Кабинет сотрудника: заявки (DS-30) ──────────────────────────────────────

export interface StaffRequestRowDTO {
  id: UUID;
  number: string;
  typeTitle: string;
  student: { fullName: string; group: string };
  createdAt: ISODateTime;
  dueAt: ISODateTime;
  overdue: boolean;
  status: RequestStatus;
  assignee: string | null;
}

export type StaffRequestsDTO = Paged<StaffRequestRowDTO> & {
  counters: { submitted: number; inProgress: number; overdue: number };
};

/** Данные студента — только ФИО, группа, программа, курс; без оценок (SPEC §6.9). */
export interface StaffRequestDTO {
  id: UUID;
  number: string;
  type: { code: string; title: string };
  status: RequestStatus;
  delivery: Delivery | null;
  copies: number;
  fields: Record<string, string | number>;
  /** Подписи полей из formSchema типа: name → «Куда предоставляется справка». */
  fieldLabels: Record<string, string>;
  createdAt: ISODateTime;
  dueAt: ISODateTime;
  overdue: boolean;
  assignee: string | null;
  student: { fullName: string; group: string; program: string; course: number };
  events: RequestEventDTO[];
  messages: MessageDTO[];
}

export type StaffTransitionAction = Exclude<RequestAction, "cancel" | "student_reply">;

export interface StaffTransitionBody {
  action: StaffTransitionAction;
  /** Обязателен для need_info и reject. */
  comment?: string;
  /** Обязателен для reject. */
  rejectReason?: RejectReason;
}

// ── Кабинет сотрудника: расписание (DS-32) ──────────────────────────────────

export interface StaffClassDTO extends Omit<ClassDTO, "note"> {
  group: { id: UUID; title: string } | null;
  /** Сколько студентов увидят изменение этой пары (группа или записанные на курс). */
  audienceSize: number;
}
export interface StaffClassesDTO {
  items: StaffClassDTO[];
}

/** GET /api/staff/reference — справочники для форм кабинета сотрудника (в пределах его факультета). */
export interface StaffReferenceDTO {
  staff: { displayName: string; initials: string; unit: string; position: string };
  faculties: { id: UUID; title: string }[];
  groups: { id: UUID; title: string; course: number; facultyId: UUID; students: number }[];
  rooms: { id: UUID; label: string }[];
  teachers: { id: UUID; fullName: string }[];
  requestTypes: { code: string; title: string }[];
}

/** GET /api/staff/audience?facultyIds=&groupIds=&courses= — сколько студентов увидят объявление. */
export interface AudienceCountDTO {
  students: number;
}

export interface ScheduleChangeCreateBody {
  type: Exclude<ScheduleChangeType, "added">;
  newStartsAt?: ISODateTime;
  newEndsAt?: ISODateTime;
  newRoomId?: UUID;
  newTeacherId?: UUID;
  /** ≤ 200 символов. */
  reason?: string;
}

// ── Поиск (C5, SPEC §6.10) ──────────────────────────────────────────────────

export type SearchGroupKey = "actions" | "schedule" | "teachers" | "rooms" | "kb" | "announcements";

export interface SearchHitDTO {
  id: string;
  title: string;
  /** Вторая строка: где и когда, чем отличается. */
  hint: string | null;
  /** Адрес внутри кабинета. */
  href: string;
}

export interface SearchGroupDTO {
  key: SearchGroupKey;
  hits: SearchHitDTO[];
}

/** GET /api/me/search?q= */
export interface SearchDTO {
  q: string;
  groups: SearchGroupDTO[];
}

// ── Справочник студента (C5, SPEC §11.4) ────────────────────────────────────

export interface KbItemDTO {
  slug: string;
  title: string;
  tags: string[];
}
export interface KbListDTO {
  items: KbItemDTO[];
}
export interface KbArticleDTO extends KbItemDTO {
  bodyMd: string;
  updatedAt: ISODateTime;
}

// ── Сеансы и демо-сброс (C8) ────────────────────────────────────────────────

export interface SessionItemDTO {
  id: UUID;
  /** «Chrome · Windows»; строка User-Agent целиком не отдаётся. */
  device: string;
  createdAt: string;
  lastSeenAt: string;
  /** Это устройство, с которого идёт запрос. */
  current: boolean;
}

export interface SessionsDTO {
  items: SessionItemDTO[];
}

export interface DemoResetDTO {
  resetAt: string;
}
