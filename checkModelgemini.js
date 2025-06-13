require('dotenv').config();

async function listModels() {
  try {
    const apiKey = process.env.GOOGLE_API_KEY;
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

    // Hacemos la petición a la API REST
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Error en la petición: ${response.statusText}`);
    }

    const data = await response.json();

    console.log("Modelos disponibles para tu API Key:");

    // Tu lógica original para filtrar y mostrar los modelos era correcta
    for (const model of data.models) {
      // Filtramos para mostrar solo los que soportan generateContent
      if (model.supportedGenerationMethods.includes("generateContent")) {
        console.log(`- Nombre: ${model.name}`);
      }
    }
  } catch (error) {
    console.error("Error al listar modelos:", error);
  }
}

listModels();