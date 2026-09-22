import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  createLocalUser,
  getLocalUserByUsername,
  listLocalUsers,
  logAudit,
  touchLastLogin,
  updateLocalUser,
} from "../db";
import {
  clearSessionCookie,
  hashPassword,
  setSessionCookie,
  signSession,
  verifyPassword,
} from "../localAuth";
import { localAdminProcedure, localProtectedProcedure, publicProcedure, router } from "../_core/trpc";

export const localAuthRouter = router({
  me: publicProcedure.query(({ ctx }) => ctx.localUser),

  login: publicProcedure
    .input(z.object({ username: z.string().min(1), password: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const user = await getLocalUserByUsername(input.username.trim());
      if (!user || !user.active || !verifyPassword(input.password, user.passwordHash)) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Usuário ou senha inválidos" });
      }
      const token = await signSession({ uid: user.id, username: user.username, name: user.name, role: user.role });
      setSessionCookie(ctx.req, ctx.res, token);
      await touchLastLogin(user.id);
      await logAudit({ userId: user.id, username: user.username, action: "login", details: "Login realizado" });
      return { id: user.id, name: user.name, username: user.username, role: user.role };
    }),

  logout: localProtectedProcedure.mutation(async ({ ctx }) => {
    clearSessionCookie(ctx.req, ctx.res);
    await logAudit({ userId: ctx.localUser.uid, username: ctx.localUser.username, action: "logout", details: "Logout realizado" });
    return { success: true } as const;
  }),

  listUsers: localAdminProcedure.query(async () => await listLocalUsers()),

  createUser: localAdminProcedure
    .input(z.object({
      name: z.string().min(1),
      username: z.string().min(2),
      password: z.string().min(4),
      role: z.enum(["admin", "analista", "cliente"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const exists = await getLocalUserByUsername(input.username.trim());
      if (exists) throw new TRPCError({ code: "CONFLICT", message: "Login já existe" });
      await createLocalUser({
        name: input.name.trim(),
        username: input.username.trim(),
        passwordHash: hashPassword(input.password),
        role: input.role,
      });
      await logAudit({ userId: ctx.localUser.uid, username: ctx.localUser.username, action: "usuario_criado", entity: input.username, details: `Usuário ${input.username} criado com perfil ${input.role}` });
      return { success: true } as const;
    }),

  updateUser: localAdminProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).optional(),
      password: z.string().min(4).optional(),
      role: z.enum(["admin", "analista", "cliente"]).optional(),
      active: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, password, ...rest } = input;
      const data: Record<string, unknown> = { ...rest };
      if (password) data.passwordHash = hashPassword(password);
      await updateLocalUser(id, data);
      await logAudit({ userId: ctx.localUser.uid, username: ctx.localUser.username, action: "usuario_alterado", entity: String(id), details: `Usuário #${id} alterado (${Object.keys(data).join(", ")})` });
      return { success: true } as const;
    }),
});
