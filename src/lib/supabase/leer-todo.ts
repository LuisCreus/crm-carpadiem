// Supabase devuelve como mucho 1.000 filas por consulta: esto las pide por tandas
// hasta tenerlas todas (para la copia de seguridad y las listas que crecen sin parar).
type Respuesta<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

export async function leerTodo<T>(consulta: (desde: number, hasta: number) => Respuesta<T>, tanda = 1000): Promise<T[]> {
  const todas: T[] = [];
  for (let desde = 0; ; desde += tanda) {
    const { data, error } = await consulta(desde, desde + tanda - 1);
    if (error) throw new Error(error.message);
    todas.push(...(data ?? []));
    if (!data || data.length < tanda) return todas;
  }
}
