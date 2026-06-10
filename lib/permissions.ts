import type { UserSession } from "@/lib/session";

export const roleLabels: Record<UserSession["role"], string> = {
  OWNER: "Propietario",
  LAB_ADMIN: "Administrador",
  SCIENTIST: "Científico",
  TECHNICIAN: "Técnico",
  REVIEWER: "Revisor",
  VIEWER: "Consulta",
  HEAD_OF_LAB: "Jefe de laboratorio",
  ANALYST: "Analista",
  ASSISTANT: "Auxiliar",
  AUDITOR: "Inspector / auditor",
  CONSULTATION: "Consulta",
  PROFESSOR: "Profesor",
  STUDENT: "Estudiante",
};
