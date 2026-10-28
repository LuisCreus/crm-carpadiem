import { BotonMicrosoft } from "./boton-microsoft";
import { Logo } from "@/components/logo";

const MENSAJES: Record<string, string> = {
  dominio: "Esa cuenta no tiene acceso. Entra con tu cuenta de Carpa Diem.",
  inactivo: "Tu usuario está desactivado. Habla con el administrador.",
  login: "No se pudo iniciar sesión. Inténtalo de nuevo.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error } = await searchParams;
  const mensaje = typeof error === "string" ? MENSAJES[error] : undefined;

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-xl border bg-card p-8 text-center">
        <Logo className="text-5xl" />
        <p className="mt-3 mb-8 text-sm text-muted-foreground">CRM · Carpas para eventos</p>
        {mensaje && (
          <p role="alert" className="mb-4 rounded-lg bg-[#FDEDEC] px-3 py-2 text-sm text-[#B0302A]">
            {mensaje}
          </p>
        )}
        <BotonMicrosoft />
      </div>
    </main>
  );
}
