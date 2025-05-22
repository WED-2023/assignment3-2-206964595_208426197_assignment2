const axios = require("axios");
const db = require("./MySql");
const api_domain = "https://api.spoonacular.com/recipes";



/**
 * Get recipes list from spooncular response and extract the relevant recipe data for preview
 * @param {*} recipes_info 
 */


async function getRecipeInformation(recipe_id) {
    return await axios.get(`${api_domain}/${recipe_id}/information`, {
        params: {
            includeNutrition: false,
            apiKey: process.env.spooncular_apiKey
        }
    });
}

async function getRecipeDetails(recipe_id) {
    let recipe_info = await getRecipeInformation(recipe_id);
    let { id, title, readyInMinutes, image, aggregateLikes, vegan, vegetarian, glutenFree } = recipe_info.data;

    return {
        id: id,
        title: title,
        readyInMinutes: readyInMinutes,
        image: image,
        popularity: aggregateLikes,
        vegan: vegan,
        vegetarian: vegetarian,
        glutenFree: glutenFree,
        
    }
}

async function getRandomRecipesFromDB() {
  try {
    const sql = `
      SELECT 
        id, title, image, readyInMinutes, 
        aggregateLikes AS popularity, vegan, vegetarian, glutenFree
      FROM recipes
      ORDER BY RAND()
      LIMIT 3
    `;
    const results = await db.query(sql);
    return results;
  } catch (error) {
    console.error("Error fetching random recipes from DB:", error.message);
    throw error;
  }
}



exports.getRecipeDetails = getRecipeDetails;



