-- O líder pode cadastrar o perfil antes de conhecer o WhatsApp.
-- O aceite do convite exige e preenche este campo antes de criar a conta.
ALTER TABLE "members" ALTER COLUMN "phone" DROP NOT NULL;
