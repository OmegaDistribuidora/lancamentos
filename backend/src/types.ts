export type Perfil = 'ADMIN' | 'GERENTE_ADMINISTRATIVO' | 'DIRETORIA' | 'USUARIO';

export type AuthUser = {
  id: number;
  login: string;
  nomeExibicao: string;
  perfil: Perfil;
};

declare module 'fastify' {
  interface FastifyRequest {
    authUser?: AuthUser;
  }
}
