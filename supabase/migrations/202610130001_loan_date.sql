-- Preserve existing rows: an unknown loan date stays NULL until the owner supplies it.
ALTER TABLE puzoto.pessoas_dividas ADD COLUMN IF NOT EXISTS data_emprestimo TEXT;
ALTER TABLE puzoto.dividas_parceladas_grupos ADD COLUMN IF NOT EXISTS data_emprestimo TEXT;
