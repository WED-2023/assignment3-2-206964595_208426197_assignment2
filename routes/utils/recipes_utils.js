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
        id, title, image, readyInMinutes AS Time, 
        aggregateLikes AS popularity,
        vegan, vegetarian, glutenFree
      FROM recipes
      ORDER BY RAND()
      LIMIT 3
    `;

    const rawResults = await db.query(sql);

    const formattedResults = rawResults.map(recipe => ({
      id: recipe.id,
      image: recipe.image,
      title: recipe.title,
      Time: recipe.Time,
      popularity: recipe.popularity,
      vegan: recipe.vegan,
      vegetarian: recipe.vegetarian,
      glutenFree: recipe.glutenFree,
      isWatched: false,    // placeholder
      isFavorite: false    // placeholder
    }));

    return formattedResults;
  } catch (error) {
    console.error("Error fetching random recipes from DB:", error.message);
    throw error;
  }
}


async function getFamilyRecipesByUser(user_id) {
  const sql = `
    SELECT id, title, image, readyInMinutes AS Time,
           aggregateLikes AS popularity, vegan, vegetarian, glutenFree,
           recipeOwner, occasion
    FROM familyrecipes
    WHERE user_id = ?
  `;
  const results = await db.query(sql, [user_id]);

  return results.map(recipe => ({
    ...recipe,
    isWatched: false,
    isFavorite: false
  }));
}


async function searchRecipes({ query, number = 5, cuisine, diet, intolerance }) {
  try {
    if (!query) {
      throw { status: 400, message: "Query parameter is required" };
    }

    const allowed = [5, 10, 15];
    const limit = allowed.includes(Number(number)) ? Number(number) : 5;

    let sql = `
      SELECT id, title, image, readyInMinutes AS Time,
             aggregateLikes AS popularity, vegan, vegetarian, glutenFree
      FROM recipes
      WHERE title LIKE ?
    `;
    const bindings = [`%${query}%`];

    if (cuisine) {
      sql += ` AND cuisine = ?`;
      bindings.push(cuisine);
    }

    if (diet) {
      if (diet === "vegan") {
        sql += ` AND vegan = true`;
      } else if (diet === "vegetarian") {
        sql += ` AND vegetarian = true`;
      } else if (diet === "glutenFree") {
        sql += ` AND glutenFree = true`;
      }
    }

    if (intolerance) {
    const intoleranceArray = intolerance.split(",").map(s => s.trim());
    sql += ` AND NOT JSON_OVERLAPS(intolerances, ?)`;
    bindings.push(JSON.stringify(intoleranceArray));
    }

    sql += ` LIMIT ?`;
    bindings.push(limit);

    const results = await db.query(sql, bindings);

    return results.map((r) => ({
      id: r.id,
      image: r.image,
      title: r.title,
      Time: r.Time,
      popularity: r.popularity,
      vegan: r.vegan,
      vegetarian: r.vegetarian,
      glutenFree: r.glutenFree,
      isWatched: false,
      isFavorite: false
    }));
  } catch (error) {
    console.error("searchRecipes error:", error.message);
    throw error;
  }
}


function detectIntolerances(ingredients) {
  const intoleranceMap = {
    dairy: ["milk", "cheese", "cream", "butter", "yogurt"],
    egg: ["egg"],
    gluten: ["flour", "wheat", "pasta", "bread"],
    peanut: ["peanut", "peanut butter"],
    shellfish: ["shrimp", "crab", "lobster"],
    soy: ["soy", "tofu"],
    treeNut: ["almond", "cashew", "walnut"],
    wheat: ["wheat", "flour"],
    sesame: ["sesame"],
    sulfite: ["sulfite"],
    grain: ["flour", "bread", "rice"],
    seafood: ["tuna", "salmon", "shrimp"]
  };

  const detected = new Set();
  const lowerIngredients = ingredients.map(i => i.toLowerCase());

  for (const [intolerance, keywords] of Object.entries(intoleranceMap)) {
    for (const keyword of keywords) {
      if (lowerIngredients.includes(keyword)) {
        detected.add(intolerance);
        break;
      }
    }
  }

  return Array.from(detected);
}






exports.getRecipeDetails = getRecipeDetails;
exports.getRandomRecipesFromDB = getRandomRecipesFromDB;
exports.getFamilyRecipesByUser = getFamilyRecipesByUser;
exports.searchRecipes = searchRecipes;
exports.detectIntolerances = detectIntolerances;







