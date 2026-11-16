# Jellyfin supports plugins for VR

[English](README.md#english) | **Français** | [中文](README.md#中文)

*Traduction française du README d’origine.*

---

Une extension JavaScript qui ajoute la lecture de vidéos VR à **Jellyfin Web**.

Elle est conçue principalement pour **Meta Quest + Jellyfin Web + WebXR**, tout en conservant l’expérience habituelle de Jellyfin : bibliothèque multimédia, mur d’affiches, métadonnées et historique de visionnage.

> Ce projet est encore en cours de développement et de test. La compatibilité peut varier selon la version de Jellyfin, le navigateur, l’appareil et le format vidéo.

## Fonctionnalités

* VR180
* VR360
* 3D SBS
* 3D OU / Top-Bottom
* WebXR
* Meta Quest Browser
* Conserve l’expérience habituelle de la bibliothèque et du mur d’affiches de Jellyfin
* Aucune modification du code du serveur Jellyfin
* Installation recommandée via JavaScript Injector

## Installation recommandée : JavaScript Injector

La méthode recommandée pour installer ce projet passe par **Jellyfin JavaScript Injector**.

Le script est ainsi injecté dans Jellyfin Web côté serveur : les appareils clients comme le Meta Quest n’ont besoin ni de Tampermonkey ni d’une application séparée.

### 1. Installer JavaScript Injector

Ouvrez Jellyfin et allez dans :

```text
Tableau de bord
→ Extensions
→ Dépôts
```

Ajoutez le dépôt de JavaScript Injector.

Pour Jellyfin 10.11 :

```text
https://raw.githubusercontent.com/n00bcodr/jellyfin-plugins/main/10.11/manifest.json
```

Pour Jellyfin 10.10.7 :

```text
https://raw.githubusercontent.com/n00bcodr/jellyfin-plugins/main/10.10/manifest.json
```

Allez ensuite dans :

```text
Tableau de bord
→ Extensions
→ Catalogue
```

Installez :

```text
JavaScript Injector
```

Redémarrez Jellyfin après l’installation.

## 2. Ajouter le script VR

Téléchargez :

```text
jellyfin-vr-player-v2.js
```

Allez ensuite dans :

```text
Tableau de bord
→ JS Injector
→ Add Script
```

Nom de script recommandé :

```text
Jellyfin VR Player
```

Collez tout le contenu de :

```text
jellyfin-vr-player-v2.js
```

dans le champ JavaScript Code.

Activez :

```text
Enabled
```

puis enregistrez.

## 3. Utilisation

Actualisez Jellyfin Web.

Ouvrez :

```text
Bibliothèque
→ Films
→ Lecture
```

Si le script est bien chargé, des commandes liées à la VR apparaissent dans le lecteur.

Sur Meta Quest, utilisez simplement :

```text
Meta Quest Browser
→ Jellyfin Web
→ Film
→ VR
```

Avec JavaScript Injector, ni Tampermonkey ni application Quest séparée ne sont nécessaires.

## Architecture recommandée

```text
NAS
 ↓
Serveur Jellyfin
 ↓
JavaScript Injector
 ↓
jellyfin-vr-player-v2.js
 ↓
Jellyfin Web
 ↓
WebXR
 ↓
Meta Quest
```

## Types de vidéo pris en charge

Formats principalement visés :

```text
VR180
VR360
SBS
OU / Top-Bottom
```

* `SBS` : images de l’œil gauche et de l’œil droit disposées côte à côte
* `OU / TB` : images de l’œil gauche et de l’œil droit disposées l’une au-dessus de l’autre

Pour les contenus VR en haute résolution, la **lecture directe (Direct Play)** est fortement recommandée dès que possible.

## Mise à jour

Téléchargez la dernière version de :

```text
jellyfin-vr-player-v2.js
```

Allez ensuite dans :

```text
Tableau de bord
→ JS Injector
→ Jellyfin VR Player
```

Remplacez l’ancien script par la nouvelle version et enregistrez.

Actualisez ensuite Jellyfin Web.

## Désinstallation

Allez dans :

```text
Tableau de bord
→ JS Injector
```

Repérez :

```text
Jellyfin VR Player
```

Puis désactivez ou supprimez le script.

## Compatibilité

| Plateforme               | État                          |
| ------------------------ | ----------------------------- |
| Jellyfin Web             | ✅ Cible principale            |
| JavaScript Injector      | ✅ Recommandé                  |
| Chrome                   | 🧪 En test                    |
| Edge                     | 🧪 En test                    |
| Meta Quest Browser       | 🧪 Cible principale           |
| Quest 2                  | 🧪 En test                    |
| Quest 3                  | 🧪 En test                    |
| Quest 3S                 | 🧪 En test                    |
| Application Jellyfin Android | ❌ Non pris en charge pour l’instant |
| Application Jellyfin TV  | ❌ Non pris en charge pour l’instant |

## Dépannage

### Le bouton VR n’apparaît pas

Vérifiez :

```text
Tableau de bord
→ JS Injector
```

Assurez-vous que :

```text
Jellyfin VR Player
```

existe et est activé.

Essayez une actualisation forcée :

```text
Ctrl + F5
```

ou :

```text
Ctrl + Maj + R
```

Dans Meta Quest Browser, fermez la page Jellyfin puis rouvrez-la.

### Le mode VR ne démarre pas

Vérifiez :

* La prise en charge de WebXR
* Les autorisations du navigateur
* Les exigences HTTPS / contexte sécurisé
* Les erreurs dans la console JavaScript
* Que le navigateur prend en charge `immersive-vr`

### La vidéo est lue mais ne s’affiche pas en VR

L’élément vidéo normal peut très bien fonctionner alors que le moteur de rendu VR n’a pas démarré.

Vérifiez :

* Le mode VR
* Le mode de projection
* Le mode stéréo
* La disponibilité de WebXR
* La console du navigateur

## Pourquoi ce projet existe

Des applications comme SKYBOX et 4XVR sont d’excellents lecteurs VR, mais lorsqu’on parcourt directement un NAS, on perd souvent l’expérience complète de bibliothèque multimédia à la Jellyfin.

L’objectif est de conserver ce parcours :

**Mur d’affiches → Détails du film → Métadonnées → Lecture**

tout en ajoutant la lecture VR.

## Remerciements

Un grand merci à **Mix1C** et au projet d’origine :

**Jellyfin-360VR-Player**

https://github.com/Mix1C/Jellyfin-360VR-Player

Le projet d’origine a fourni une inspiration importante pour étendre Jellyfin Web avec la lecture VR / 360°.

Ce projet poursuit cette idée en se concentrant sur :

* VR180
* VR360
* SBS
* OU / Top-Bottom
* WebXR
* Meta Quest
* Les commandes de lecture VR
* L’intégration à Jellyfin

Un grand merci à Mix1C pour l’exploration et l’inspiration d’origine.

## Licence

Ce projet est publié sous la **Licence publique générale GNU (GPL)**.

Consultez :

```text
LICENSE
```

pour les conditions complètes de la licence.

## Avertissement

Il s’agit d’un projet Jellyfin tiers non officiel.

Il n’est ni affilié à Jellyfin ni approuvé par Jellyfin.

## Contribuer

Les retours et contributions sont les bienvenus :

* Issues
* Rapports de bugs
* Demandes de fonctionnalités
* Pull requests

GitHub :

https://github.com/JiaruiGe/jellyfinvr
