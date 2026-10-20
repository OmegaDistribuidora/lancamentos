export type Perfil = 'ADMIN' | 'GERENTE_ADMINISTRATIVO' | 'DIRETORIA' | 'LOGISTICA' | 'USUARIO';

export type AuthUser = {
  id: number;
  login: string;
  nomeExibicao: string;
  perfil: Perfil;
  acessoDespesaCarga: boolean;
};

declare module 'fastify' {
  interface FastifyRequest {
    authUser?: AuthUser;
  }
}
