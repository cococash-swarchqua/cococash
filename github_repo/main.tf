# Define the GitHub organization
resource "github_organization_settings" "org_settings" {
    billing_email = "jvasquezp@unal.edu.co"
    company = "cococash-swarchqua"
    location = "Colombia"
    name = "CocoCash"
    description = "CocoCash"
    has_organization_projects = true
    has_repository_projects = true
    default_repository_permission = "read"
    members_can_create_repositories = false
    members_can_create_public_repositories = false
    members_can_create_private_repositories = false
    members_can_create_internal_repositories = false

    # Pages are a way to host static websites directly from a GitHub repository.
    members_can_create_pages = true
    members_can_create_public_pages = true
    members_can_create_private_pages = true

    members_can_fork_private_repositories = false
    web_commit_signoff_required = false
    advanced_security_enabled_for_new_repositories = false

    # Dependabot
    dependabot_alerts_enabled_for_new_repositories = false
    dependabot_security_updates_enabled_for_new_repositories = false
    dependency_graph_enabled_for_new_repositories = false
    
    # Secret scanning
    secret_scanning_enabled_for_new_repositories = true
    secret_scanning_push_protection_enabled_for_new_repositories = true
}

# Team
resource "github_team" "cococash_team" {
  name        = "cococash-team"
  description = "El equipo de desarrollo de CocoCash"
}

# Adding members to the organization
resource "github_membership" "membership_for_jvasquezp" {
  username = "jvasquezp"
  role     = "admin"
}
resource "github_membership" "membership_for_fnovoas" {
  username = "fnovoas"
  role     = "member"
}
resource "github_membership" "membership_for_10scar" {
  username = "10scar"
  role     = "member"
}
resource "github_membership" "membership_for_Fabio_Murcia" {
  username = "Fabio-Murcia"
  role     = "member"
}
resource "github_membership" "membership_for_CatGmz" {
  username = "CatGmz"
  role     = "member"
}

resource "github_team_members" "cococash_team_members" {
  team_id  = github_team.cococash_team.id

  members {
    username = "jvasquezp"
    role     = "maintainer"
  }
  members {
    username = "fnovoas"
    role     = "member"
  }
  members {
    username = "10scar"
    role     = "member"
  }
  members {
    username = "Fabio-Murcia"
    role     = "member"
  }
  members {
    username = "CatGmz"
    role     = "member"
  }
}

# Repository for the project
resource "github_repository" "cococash_repo" {
  name        = "cococash"
  description = "CocoCash - Plataforma de gestión financiera"

  # Repository configuration
  visibility = "public"
  has_issues = true
  has_discussions = true
  has_projects = true
  has_wiki = true

  # Settings for the repository
  allow_merge_commit = true
  allow_squash_merge = true
  allow_rebase_merge = false
  allow_auto_merge = true
  delete_branch_on_merge = true

  # has_downloads = false

  # Initial commit with a README.md file
  auto_init = true
  gitignore_template = "VisualStudio"

  archived = false
  archive_on_destroy = true

  # Enable vulnerability alerts and automated security fixes
  security_and_analysis {
    secret_scanning {
      status = "enabled"
    }
    secret_scanning_push_protection {
      status = "enabled"
    }
  }  
  vulnerability_alerts = true
  # ignore_vulnerability_alerts_during_read = false 

  allow_update_branch = true
}

resource "github_repository_collaborators" "cococash_repo_collaborators" {
  repository = github_repository.cococash_repo.name

  team {
    permission = "push"
    team_id = github_team.cococash_team.id
  }
}

# Create the "development" branch
resource "github_branch" "development" {
  repository = github_repository.cococash_repo.name
  branch     = "development"
}

resource "github_branch_protection" "cococash_repo_protection" {
  repository_id  = github_repository.cococash_repo.name
  pattern        = "main"

  enforce_admins          = true
  require_signed_commits  = false
  required_linear_history = false
  require_conversation_resolution = true
  
  required_status_checks {
    strict = true
  }

  required_pull_request_reviews {
    dismiss_stale_reviews           = true
    require_code_owner_reviews      = false
    required_approving_review_count = 2 # Somos 5, 2 aprobaciones es razonable
    require_last_push_approval      = true
  }

  allows_force_pushes = false
  allows_deletions    = false
  lock_branch         = false
}

resource "github_branch_protection" "cococash_repo_protection_development" {
  repository_id  = github_repository.cococash_repo.name
  pattern        = "development"

  enforce_admins          = true
  require_signed_commits  = false
  required_linear_history = false
  require_conversation_resolution = true
  
  required_status_checks {
    strict = true
  }

  required_pull_request_reviews {
    dismiss_stale_reviews           = true
    require_code_owner_reviews      = false
    required_approving_review_count = 1
    require_last_push_approval      = true
  }

  allows_force_pushes = false
  allows_deletions    = false
  lock_branch         = false
}