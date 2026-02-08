{
  description = "Entorno de Terraform y AWS CLI";

  inputs = {
    # Usamos la rama estable más reciente
    nixpkgs.url = "github:nixos/nixpkgs/nixos-25.11";
  };

  outputs = { self, nixpkgs }:
    let
      # Define tu sistema aquí (x86_64-linux, aarch64-darwin para Mac M1/M2, etc.)
      system = "x86_64-linux"; 
      pkgs = import nixpkgs {
        inherit system;
        config.allowUnfree = true; # Permite Terraform (BSL)
      };
    in
    {
      devShells.${system}.default = pkgs.mkShell {
        buildInputs = [
          pkgs.terraform
          pkgs.awscli2
        ];

        shellHook = ''
          echo "--- ❄️ Entorno Nix Flake Activado ---"
          echo "Terraform: $(terraform --version | head -n 1)"
          echo "AWS CLI: $(aws --version)"
        '';
      };
    };
}