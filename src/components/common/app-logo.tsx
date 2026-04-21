import logo from "@/assets/logo.png";

export function AppLogo() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex size-12 items-center justify-center overflow-hidden ">
        <img src={logo} alt="Logo Pizza n Roll" className="size-full object-cover" />
      </div>
      <div>
        <p className="text-sm font-semibold tracking-wide text-foreground">Poke and Roll</p>
        <p className="text-xs text-muted-foreground">POS gastronómico operativo</p>
      </div>
    </div>
  );
}
