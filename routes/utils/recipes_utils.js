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
    // Spoonacular recipe
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
      isWatched: false,
      isFavorite: false
    };
  }

  // Custom recipe
  const sql = `
    SELECT id, user_id, title, image, readyInMinutes,
          aggregateLikes, vegan, vegetarian, glutenFree,
          NULL AS recipeOwner, NULL AS occasion,
          ingredients, instructions, NULL AS servings, intolerances
    FROM myrecipes
    WHERE id = ?
    UNION
    SELECT id, user_id, title, image, readyInMinutes,
          aggregateLikes, vegan, vegetarian, glutenFree,
          recipeOwner, occasion,
          ingredients, instructions, servings, intolerances
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
    image: r.image,
    readyInMinutes: r.readyInMinutes,
    popularity: r.aggregateLikes,
    vegan: r.vegan,
    vegetarian: r.vegetarian,
    glutenFree: r.glutenFree,
    ingredients: JSON.parse(r.ingredients || "[]"),
    instructions: r.instructions,
    servings: r.servings,
    recipeOwner: r.recipeOwner,
    occasion: r.occasion,
    intolerances: JSON.parse(r.intolerances || "[]"),
    isWatched: false,
    isFavorite: false
  };
}


async function getExploreRecipes(user_id) {
  const fromDB = !!user_id && Math.random() < 0.5;
  let recipeIds = [];

  if (fromDB) {
    const sql = `
      SELECT id
      FROM myrecipes
      WHERE user_id = ?
      UNION
      SELECT id
      FROM familyrecipes
      WHERE user_id = ?
      ORDER BY RAND()
      LIMIT 3
    `;
    const results = await db.query(sql, [user_id, user_id]);
    recipeIds = results.map(r => r.id);
  } else {
    const response = await axios.get(`${api_domain}/random`, {
      params: {
        number: 3,
        apiKey: process.env.spoonacular_apiKey
      }
    });
    recipeIds = response.data.recipes.map(r => r.id);
  }

  return await getRecipesPreview(recipeIds, user_id);
}


async function createPersonalRecipe(user_id, recipeData) {
  const {
    title,
    image,
    readyInMinutes,
    ingredients,
    instructions,
    vegan,
    vegetarian,
    glutenFree,
    intolerance
  } = recipeData;

  const id = await generateUniqueId("p", "myrecipes");
  const intolerances = await detectAndSaveIntolerances(id, ingredients);

  const sql = `
    INSERT INTO myrecipes (
      id, user_id, title, image, readyInMinutes, ingredients,
      instructions, vegan, vegetarian, glutenFree, intolerances
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  await db.query(sql, [
    id,
    user_id,
    title,
    image,
    readyInMinutes,
    JSON.stringify(ingredients),
    instructions,
    vegan,
    vegetarian,
    glutenFree,
    JSON.stringify(intolerances)
  ]);

  return id;
}



async function getFamilyRecipesByUser(user_id) {
  const sql = `
    SELECT id, user_id, title, image, readyInMinutes AS Time,
           aggregateLikes AS popularity, vegan, vegetarian, glutenFree,
           recipeOwner, occasion, ingredients, instructions, servings, intolerances
    FROM familyrecipes
    WHERE user_id = ?
  `;
  const results = await db.query(sql, [user_id]);

  

  return results.map(recipe => ({
    ...recipe,
  intolerances:
    (() => {
      try {
        if (!recipe.intolerances) return [];
        return typeof recipe.intolerances === "string"
          ? JSON.parse(recipe.intolerances)
          : recipe.intolerances;
      } catch (e) {
        console.error(" Error parsing intolerances:", recipe.id, recipe.intolerances);
        return [];
      }
    })(),
    isWatched: false,
    isFavorite: false
  }));
}

async function getFamilyRecipeById(recipeId, user_id) {
  const sql = `
    SELECT id, user_id, title, image, readyInMinutes AS Time,
           aggregateLikes AS popularity, vegan, vegetarian, glutenFree,
           recipeOwner, occasion, ingredients, instructions, servings, intolerances
    FROM familyrecipes
    WHERE id = ? AND user_id = ?
  `;
  const results = await db.query(sql, [recipeId, user_id]);

  if (results.length === 0) {
    throw { status: 404, message: "Family recipe not found" };
  }

  const recipe = results[0];

  return {
    id: recipe.id,
    title: recipe.title,
    image: recipe.image,
    Time: recipe.Time,
    popularity: recipe.popularity,
    vegan: recipe.vegan,
    vegetarian: recipe.vegetarian,
    glutenFree: recipe.glutenFree,
    recipeOwner: recipe.recipeOwner,
    occasion: recipe.occasion,
    ingredients: recipe.ingredients,
    instructions: recipe.instructions,
    servings: recipe.servings,
    intolerances: JSON.parse(recipe.intolerances || "[]"),
    isWatched: false,
    isFavorite: false
  };
}


// utils/recipes_utils.js
async function createFamilyRecipe(user_id, recipeData) {
  const {
    title,
    image,
    readyInMinutes,
    ingredients,
    instructions,
    servings,
    recipeOwner,
    occasion,
    vegan,
    vegetarian,
    glutenFree,
    intolerance 
  } = recipeData;

  const id = await generateUniqueId("f", "familyrecipes");
  const intolerances = await detectAndSaveIntolerances(id, ingredients);

  const sql = `
    INSERT INTO familyrecipes (
      id, user_id, title, image, readyInMinutes, ingredients,
      instructions, servings, recipeOwner, occasion,
      vegan, vegetarian, glutenFree, intolerances
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  await db.query(sql, [
    id,
    user_id,
    title,
    image,
    readyInMinutes,
    JSON.stringify(ingredients),
    instructions,
    servings,
    recipeOwner,
    occasion,
    vegan,
    vegetarian,
    glutenFree,
    JSON.stringify(intolerances) 
  ]);

  return id;
}



async function searchRecipes({ query, number = 5, cuisine, diet, intolerance }) {
  try {
    if (!query) {
      throw { status: 400, message: "Query parameter is required" };
    }

    const allowed = [5, 10, 15];
    const limit = allowed.includes(Number(number)) ? Number(number) : 5;
    const intoleranceArray = intolerance ? intolerance.split(",").map(s => s.trim()) : [];

    // ---------- FROM DB ----------
    let sql = `
      (
        SELECT id, title, image, readyInMinutes AS Time,
               aggregateLikes AS popularity, vegan, vegetarian, glutenFree
        FROM myrecipes
        WHERE title LIKE ?
    `;
    const bindings = [`%${query}%`];

    if (diet === "vegan") {
      sql += ` AND vegan = true`;
    } else if (diet === "vegetarian") {
      sql += ` AND vegetarian = true`;
    } else if (diet === "glutenFree") {
      sql += ` AND glutenFree = true`;
    }

    if (intoleranceArray.length) {
      sql += ` AND NOT JSON_OVERLAPS(intolerances, ?)`;
      bindings.push(JSON.stringify(intoleranceArray));
    }

    sql += `)
    UNION
    (
      SELECT id, title, image, readyInMinutes AS Time,
             aggregateLikes AS popularity, vegan, vegetarian, glutenFree
      FROM familyrecipes
      WHERE title LIKE ?`;

    bindings.push(`%${query}%`);

    if (diet === "vegan") {
      sql += ` AND vegan = true`;
    } else if (diet === "vegetarian") {
      sql += ` AND vegetarian = true`;
    } else if (diet === "glutenFree") {
      sql += ` AND glutenFree = true`;
    }

    if (intoleranceArray.length) {
      sql += ` AND NOT JSON_OVERLAPS(intolerances, ?)`;
      bindings.push(JSON.stringify(intoleranceArray));
    }

    sql += `)
    LIMIT ?`;
    bindings.push(limit);

    const dbResults = await db.query(sql, bindings);
    const mappedDbResults = dbResults.map((r) => ({
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

    // ---------- FROM SPOONACULAR ----------
    const spoonacularResponse = await axios.get('https://api.spoonacular.com/recipes/complexSearch', {
      params: {
        query,
        number: limit,
        cuisine,
        diet,
        intolerances: intolerance,
        apiKey: process.env.spoonacular_apiKey
      }
    });

    const ids = spoonacularResponse.data.results.map(r => r.id);

    const detailedRecipes = await Promise.all(ids.map(async (id) => {
      const info = await axios.get(`https://api.spoonacular.com/recipes/${id}/information`, {
        params: { includeNutrition: false, apiKey: process.env.spoonacular_apiKey }
      });
      const r = info.data;
      return {
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
      };
    }));

    return [...mappedDbResults, ...detailedRecipes];

  } catch (error) {
    console.error("searchRecipes error:", error.message);
    throw error;
  }
}



async function getRecipesPreview(recipe_ids, user_id = null) {
  const previews = [];

  for (const id of recipe_ids) {
    try {
      let recipe;

      if (!isNaN(id)) {
        // Spoonacular
        const response = await getRecipeInformation(id);
        const r = response.data;

        recipe = {
          id: r.id,
          title: r.title,
          image: r.image,
          Time: r.readyInMinutes,
          popularity: r.aggregateLikes,
          vegan: r.vegan,
          vegetarian: r.vegetarian,
          glutenFree: r.glutenFree,

        };
      } else {
        // DB: personal/family
        const sql = `
          SELECT id, title, image, readyInMinutes AS Time,
                 aggregateLikes AS popularity, vegan, vegetarian, glutenFree
          FROM myrecipes
          WHERE id = ?
          UNION
          SELECT id, title, image, readyInMinutes AS Time,
                 aggregateLikes AS popularity, vegan, vegetarian, glutenFree
          FROM familyrecipes
          WHERE id = ?
        `;
        const results = await db.query(sql, [id, id]);
        if (results.length === 0) continue;
        recipe = results[0];
      }

      if (user_id) {
        const [favRows] = await db.query(
          `SELECT 1 FROM favoriterecipes WHERE user_id = ? AND recipe_id = ?`,
          [user_id, id]
        );
        const [watchedRows] = await db.query(
          `SELECT 1 FROM watched_recipes WHERE user_id = ? AND recipe_id = ?`,
          [user_id, id]
        );
        recipe.isFavorite = favRows.length > 0;
        recipe.isWatched = watchedRows.length > 0;
      } else {
        recipe.isFavorite = false;
        recipe.isWatched = false;
      }

      previews.push(recipe);
    } catch (err) {
      console.error(` Failed to fetch preview for recipe ${id}:`, err.message);
  
    }
  }

  return previews;
}



async function detectAndSaveIntolerances(recipeId, ingredients) {
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

  const lowerIngredients = ingredients.map(i =>
    typeof i === "string" ? i.toLowerCase() : i.name?.toLowerCase()
  );

  const detected = new Set();

  for (const [intolerance, keywords] of Object.entries(intoleranceMap)) {
    for (const keyword of keywords) {
      if (lowerIngredients.some(ing => ing.includes(keyword))) {
        detected.add(intolerance);
        break;
      }
    }
  }

  const intolerancesArray = Array.from(detected);
  const intoleranceJSON = JSON.stringify(intolerancesArray);

  // Determine which table to update
  let table = null;
  if (isNaN(recipeId)) {
    table = recipeId.startsWith("f") ? "familyrecipes" : "myrecipes";
  } else {
    // Spoonacular recipe — no update
    return intolerancesArray;
  }

  const sql = `UPDATE ${table} SET intolerances = ? WHERE id = ?`;
  await db.query(sql, [intoleranceJSON, recipeId]);

  return intolerancesArray;
}


async function generateUniqueId(prefix, table) {
  let suffix = 1;
  let id;
  while (true) {
    id = `${prefix}_${suffix}`;
    const result = await db.query(`SELECT id FROM ${table} WHERE id = ?`, [id]);
    if (result.length === 0) break;
    suffix++;
  }
  return id;
}

async function getRecipeLikeCount(recipe_id) {
  const result = await DButils.execQuery(
    `SELECT COUNT(*) AS likes FROM recipe_likes WHERE recipe_id = ?`,
    [recipe_id]
  );
  return result[0].likes;
}



module.exports = {
  getRecipeInformation,
  getRecipeDetails,
  getExploreRecipes,
  getFamilyRecipesByUser,
  getFamilyRecipeById,
  searchRecipes,
  getRecipesPreview,
  detectAndSaveIntolerances,
  generateUniqueId,
  getRecipeLikeCount,
  createPersonalRecipe,
  createFamilyRecipe
  
};
