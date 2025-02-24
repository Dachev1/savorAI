package dev.idachev.backend.macros.model;

import dev.idachev.backend.recipe.model.Recipe;
import jakarta.persistence.*;
import lombok.*;

import java.util.UUID;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@Entity
@Table(name = "macros")
public class Macros {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    private String calories;

    private String protein;

    private String carbs;

    private String fat;

    @OneToOne
    private Recipe recipe;
}
