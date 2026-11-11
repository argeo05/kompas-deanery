import type { ProgramLevel, StudyForm } from "@/contracts/api";

export const STUDY_FORM_LABEL: Record<StudyForm, string> = {
  full_time: "Очная",
  part_time: "Заочная",
  evening: "Очно-заочная (вечерняя)",
};

export const PROGRAM_LEVEL_LABEL: Record<ProgramLevel, string> = {
  bachelor: "Бакалавриат",
  master: "Магистратура",
  specialist: "Специалитет",
  postgraduate: "Аспирантура",
};

export const DATA_FIX_FIELDS = [
  { value: "fullName", label: "ФИО" },
  { value: "group", label: "Группа" },
  { value: "program", label: "Направление" },
  { value: "contacts", label: "Контакты" },
  { value: "other", label: "Другое" },
] as const;
