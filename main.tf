module "github_repo" {
  source = "./github_repo"

  providers = {
    github = github
  }
}
