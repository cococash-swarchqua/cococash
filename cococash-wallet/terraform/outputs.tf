output "security_group_id" {
  description = "ID del security group creado para el servicio"
  value       = aws_security_group.service.id
}

output "db_connection" {
  description = "Cadena de conexión simple (endpoint:port) pasada como variable"
  value       = "${var.db_endpoint}:${var.db_port}"
}
output "db_instance_endpoint" {
  description = "Endpoint DNS del RDS Postgres creado"
  value       = aws_db_instance.postgres.address
}

output "db_instance_port" {
  description = "Puerto del RDS Postgres"
  value       = aws_db_instance.postgres.port
}

output "db_instance_id" {
  description = "ID del RDS instance"
  value       = aws_db_instance.postgres.id
}

output "db_security_group_id" {
  description = "ID del security group asociado a la BD"
  value       = aws_security_group.db.id
}