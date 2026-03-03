output "vpc_id" {
  description = "ID de la VPC principal creada por el módulo cococash-infra"
  value       = aws_vpc.main.id
}

output "public_subnet_id" {
  description = "ID de la subnet pública creada"
  value       = aws_subnet.public.id
}

output "private_subnet_id_1" {
  description = "ID de la primera subnet privada (ECS)"
  value       = aws_subnet.private1.id
}

output "private_subnet_id_2" {
  description = "ID de la segunda subnet privada (RDS)"
  value       = aws_subnet.private2.id
}
