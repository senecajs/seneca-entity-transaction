CREATE TABLE seneca_users
(
  id int NOT NULL AUTO_INCREMENT,
  username varchar(255) NOT NULL,
  email varchar(255) NOT NULL,
  unique (email),
  PRIMARY KEY (id)
);
