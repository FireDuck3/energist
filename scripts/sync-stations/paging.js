// Посторінкове читання: PostgREST віддає не більше 1000 рядків за запит.
export async function fetchAllPages(fetchPage, pageSize = 1000) {
  const all = [];
  for (let from = 0; ; from += pageSize) {
    const page = await fetchPage(from, from + pageSize - 1);
    all.push(...page);
    if (page.length < pageSize) return all;
  }
}
