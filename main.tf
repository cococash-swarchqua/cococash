module "cococash_infra" {
  source = "./cococash-infra"

  providers = {
    aws = aws
  }
}