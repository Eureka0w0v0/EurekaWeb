async function checkMaintenanceMode() {
  try {
    const response = await fetch("../site-config.json", { cache: "no-store" });
    if (!response.ok) {
      return;
    }

    const config = await response.json();
    if (!config.maintenance) {
      window.location.replace("../index.html");
    }
  } catch (error) {
    console.error("Failed to read maintenance config.", error);
  }
}

checkMaintenanceMode();
