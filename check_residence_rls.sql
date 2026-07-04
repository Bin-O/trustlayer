SELECT * FROM residence_statuses WHERE id = '7f8923b1-b988-492f-837b-1968df527de9';

SELECT policyname, cmd, qual, with_check, roles
FROM pg_policies
WHERE tablename = 'residence_statuses';
