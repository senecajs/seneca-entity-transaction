CREATE TABLE seneca_users
(
  id SERIAL PRIMARY KEY,
  username character varying not null,
  email character varying not null,
  unique(email)
);
