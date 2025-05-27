const axios = require("axios");
require("dotenv").config();
const db = require("./MySql");
const api_domain = "https://api.spoonacular.com/recipes";

async function getRecipeInformation(recipe_id) {
  return await axios.get(`${api_domain}/${recipe_id}/information`, {
    params: {
      includeNutrition: false,
      apiKey: process.env.spoonacular_apiKey
    }
  });
}

async function getRecipeDetails(recipe_id) {
  if (!isNaN(recipe_id)) {
    // Spoonacular recipe (numeric ID)
    const recipe_info = await getRecipeInformation(recipe_id);
    const r = recipe_info.data;

    return {
      id: r.id,
      title: r.title,
      readyInMinutes: r.readyInMinutes,
      image: r.image,
      popularity: r.aggregateLikes,
      vegan: r.vegan,
      vegetarian: r.vegetarian,
      glutenFree: r.glutenFree,
      ingredients: r.extendedIngredients?.map(i => ({
        name: i.name,
        amount: i.amount,
        unit: i.unit
      })),
      instructions: r.instructions,
      servings: r.servings
    };
  } else {
    // Personal or family recipe (string ID)
    const sql = `
      SELECT *
      FROM recipes
      WHERE id = ?
      UNION
      SELECT *
      FROM familyrecipes
      WHERE id = ?
    `;
    const results = await db.query(sql, [recipe_id, recipe_id]);

    if (results.length === 0) {
      throw { status: 404, message: "Recipe not found in database" };
    }

    const r = results[0];
    return {
      id: r.id,
      title: r.title,
      readyInMinutes: r.readyInMinutes,
      image: r.image,
      popularity: r.aggregateLikes,
      vegan: r.vegan,
      vegetarian: r.vegetarian,
      glutenFree: r.glutenFree,
      ingredients: JSON.parse(r.ingredients),
      instructions: r.instructions,
      servings: r.servings,
      ...(r.recipeOwner && { recipeOwner: r.recipeOwner }),
      ...(r.occasion && { occasion: r.occasion })
    };
  }
}

async function getRandomRecipesForUser(user_id) {
  const fromDB = Math.random() < 0.5;

  if (fromDB) {
    const sql = `
      SELECT id, title, image, readyInMinutes AS Time,
             aggregateLikes AS popularity, vegan, vegetarian, glutenFree
      FROM recipes
      WHERE user_id = ?
      UNION
      SELECT id, title, image, readyInMinutes AS Time,
             aggregateLikes AS popularity, vegan, vegetarian, glutenFree
      FROM familyrecipes
      WHERE user_id = ?
      ORDER BY RAND()
      LIMIT 3
    `;
    const results = await db.query(sql, [user_id, user_id]);
    return results.map(r => ({
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
  } else {
    return await get3RandomSpoonacularRecipes();
  }
}

async function get3RandomSpoonacularRecipes() {
  const response = await axios.get(`${api_domain}/random`, {
    params: {
      number: 3,
      apiKey: process.env.SPOONACULAR_API_KEY
    }
  });

  return response.data.recipes.map((r) => ({
    id: r.id,
    image: r.image,
    title: r.title,
    Time: r.readyInMinutes,
    popularity: r.aggregateLikes,
    vegan: r.vegan,
    vegetarian: r.vegetarian,
    glutenFree: r.glutenFree,
    isWatched: false,
    isFavorite: false
  }));
}

async function getFamilyRecipesByUser(user_id) {
  const sql = `
    SELECT id, title, image, readyInMinutes AS Time,
           aggregateLikes AS popularity, vegan, vegetarian, glutenFree,
           recipeOwner, occasion, ingredients, instructions, servings
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

module.exports = {
  getRecipeInformation,
  getRecipeDetails,
  getRandomRecipesForUser,
  get3RandomSpoonacularRecipes,
  getFamilyRecipesByUser,
  searchRecipes,
  detectIntolerances
};

